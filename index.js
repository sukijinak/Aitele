import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY;
const MODEL_COMBO = process.env.MODEL_COMBO || "gpt-4o-mini";
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || "1800000", 10);

if (!BOT_TOKEN || !API_KEY) {
  console.error(" Error: BOT_TOKEN dan API_KEY harus diisi di file .env!");
  process.exit(1);
}

// Read system prompt file
let systemPrompt = "Kamu adalah asisten AI yang ramah.";
try {
  systemPrompt = fs.readFileSync(path.resolve("system-prompt.txt"), "utf-8").trim();
} catch (err) {
  console.warn("⚠️ Warning: File system-prompt.txt tidak ditemukan. Menggunakan prompt default.");
}

const bot = new Bot(BOT_TOKEN);
const userSessions = new Map(); // key: userId, value: { isActive, lastInteraction, lastAiMessageId }

// Cleanup Session Timeout Sweep
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions.entries()) {
    if (session.isActive && now - session.lastInteraction > SESSION_TIMEOUT) {
      userSessions.set(userId, { ...session, isActive: false });
      bot.api.sendMessage(
        userId,
        " Sesi AI kamu udah berakhir karena 30 menit nggak ada aktivitas. Kirim `/ai on` buat ngobrol lagi ya!"
      ).catch(() => {});
    }
  }
}, 60000); // Cek tiap 1 menit

// Utility: Strip Markdown characters from response
function cleanMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/[\*_`~#\+\-\=\|\{\}\.\!\[\]\(\)>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Utility: Call 9router OpenAI-Compatible API
async function fetch9RouterAI(userPrompt) {
  const response = await fetch("https://api.9router.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL_COMBO,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API 9router Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawOutput = data.choices?.[0]?.message?.content || "Maaf, AI tidak memberikan respons.";
  return cleanMarkdown(rawOutput);
}

// Dynamic Command Registration
import { setupStartCommand } from "./commands/start.js";
import { setupHelpCommand } from "./commands/help.js";
import { setupAiCommand } from "./commands/ai.js";

setupStartCommand(bot);
setupHelpCommand(bot);
setupAiCommand(bot, userSessions);

// Middleware/Handler for Text Messages & Edits
async function handleUserMessage(ctx, isEdit = false) {
  const userId = ctx.from?.id;
  const text = ctx.message?.text || ctx.editedMessage?.text;

  if (!userId || !text || text.startsWith("/")) return;

  const session = userSessions.get(userId);

  // Validation: Check active session & timeout
  if (!session || !session.isActive) {
    if (isEdit) return; // Ignore edits if session is inactive
    const keyboard = new InlineKeyboard().text(" Nyalakan AI", "ai_on");
    return ctx.reply(" Mode AI kamu belum aktif. Klik tombol di bawah atau ketik `/ai on` untuk mulai ngobrol!", {
      reply_markup: keyboard,
    });
  }

  // Update last interaction timestamp
  session.lastInteraction = Date.now();
  userSessions.set(userId, session);

  // Send initial indicator
  let tempMessage;
  try {
    if (isEdit && session.lastAiMessageId) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        session.lastAiMessageId,
        " AI lagi mikirin jawaban baru untuk pesan yang diedit..."
      );
    } else {
      tempMessage = await ctx.reply(" AI lagi mikir...");
    }

    const aiResponse = await fetch9RouterAI(text);

    if (isEdit && session.lastAiMessageId) {
      await ctx.api.editMessageText(ctx.chat.id, session.lastAiMessageId, aiResponse);
    } else if (tempMessage) {
      await ctx.api.editMessageText(ctx.chat.id, tempMessage.message_id, aiResponse);
      session.lastAiMessageId = tempMessage.message_id;
      userSessions.set(userId, session);
    }
  } catch (error) {
    console.error("AI Handling Error:", error);
    const errorText = " Waduh, maaf ya! Ada gangguan pas nyoba dapet respons dari AI. Coba lagi beberapa saat lagi.";
    
    if (tempMessage) {
      await ctx.api.editMessageText(ctx.chat.id, tempMessage.message_id, errorText).catch(() => {});
    } else {
      await ctx.reply(errorText).catch(() => {});
    }
  }
}

// Listen to new messages and edits
bot.on("message:text", (ctx) => handleUserMessage(ctx, false));
bot.on("edited_message:text", (ctx) => handleUserMessage(ctx, true));

// Error handling to prevent crash
bot.catch((err) => {
  console.error("Bot Error Captured:", err.error);
});

// Start bot
bot.start({
  onStart: (botInfo) => {
    console.log(` Bot ready! Logged in as @${botInfo.username}`);
  },
});
