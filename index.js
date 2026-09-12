import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY || "9router"; // Local CLI biasanya fleksibel
const MODEL_COMBO = process.env.MODEL_COMBO || "ai";
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || "1800000", 10);

// Endpoint 9Router Local Proxy (Sesuaikan port jika berbeda, default: 20128)
const ROUTER_BASE_URL = process.env.ROUTER_BASE_URL || "http://127.0.0.1:20128/v1/chat/completions";

if (!BOT_TOKEN) {
  console.error("❌ Error: BOT_TOKEN harus diisi di file .env!");
  process.exit(1);
}

// Baca system prompt
let systemPrompt = "Kamu adalah asisten AI yang ramah.";
try {
  systemPrompt = fs.readFileSync(path.resolve("system-prompt.txt"), "utf-8").trim();
} catch (err) {
  console.warn("⚠️ Warning: File system-prompt.txt tidak ditemukan. Menggunakan prompt default.");
}

const bot = new Bot(BOT_TOKEN);
const userSessions = new Map();

// Session Timeout Cleaner
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of userSessions.entries()) {
    if (session.isActive && now - session.lastInteraction > SESSION_TIMEOUT) {
      userSessions.set(userId, { ...session, isActive: false });
      bot.api.sendMessage(
        userId,
        "⏳ Sesi AI kamu sudah berakhir karena 30 menit tidak ada aktivitas. Kirim `/ai on` untuk mulai lagi."
      ).catch(() => {});
    }
  }
}, 60000);

// Helper: Hapus karakter Markdown (*, _, `, ~, #, dll)
function cleanMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/[\*_`~#\+\-\=\|\{\}\.\!\[\]\(\)>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Helper: Handshake ke 9Router (Support Normal JSON & Streaming Fallback)
async function fetch9RouterAI(userPrompt) {
  const response = await fetch(ROUTER_BASE_URL, {
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
      ],
      stream: false
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`9Router Error (${response.status}): ${errText}`);
  }

  const rawText = await response.text();
  let content = "";

  // Handle jika response yang kembali berupa Streaming (SSE)
  if (rawText.startsWith("data:")) {
    const lines = rawText.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:") && !line.includes("[DONE]")) {
        try {
          const json = JSON.parse(line.replace(/^data:\s*/, ""));
          const chunk = json.choices?.[0]?.delta?.content || json.choices?.[0]?.text || "";
          content += chunk;
        } catch (e) {
          // Skip malformed chunk
        }
      }
    }
  } else {
    // Standard JSON Response
    const data = JSON.parse(rawText);
    content = data.choices?.[0]?.message?.content || "";
  }

  if (!content) {
    content = "Maaf, AI tidak memberikan respons.";
  }

  return cleanMarkdown(content);
}

// Import Command Handlers
import { setupStartCommand } from "./commands/start.js";
import { setupHelpCommand } from "./commands/help.js";
import { setupAiCommand } from "./commands/ai.js";

setupStartCommand(bot);
setupHelpCommand(bot);
setupAiCommand(bot, userSessions);

// Core Message Handler (Handle edit & fresh message)
async function handleUserMessage(ctx, isEdit = false) {
  const userId = ctx.from?.id;
  const text = ctx.message?.text || ctx.editedMessage?.text;

  if (!userId || !text || text.startsWith("/")) return;

  const session = userSessions.get(userId);

  if (!session || !session.isActive) {
    if (isEdit) return;
    const keyboard = new InlineKeyboard().text("⚡ Nyalakan AI", "ai_on");
    return ctx.reply("Mode AI belum aktif. Ketik `/ai on` atau tekan tombol di bawah:", {
      reply_markup: keyboard,
    });
  }

  session.lastInteraction = Date.now();
  userSessions.set(userId, session);

  let tempMessage;
  try {
    if (isEdit && session.lastAiMessageId) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        session.lastAiMessageId,
        "🔄 Memproses ulang pesan yang diedit..."
      );
    } else {
      tempMessage = await ctx.reply("⏳ Memproses jawaban...");
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
    const errorText = "❌ Gagal mengambil respons dari 9Router Lokal. Pastikan CLI/Server 9Router sudah berjalan.";
    
    if (isEdit && session.lastAiMessageId) {
      await ctx.api.editMessageText(ctx.chat.id, session.lastAiMessageId, errorText).catch(() => {});
    } else if (tempMessage) {
      await ctx.api.editMessageText(ctx.chat.id, tempMessage.message_id, errorText).catch(() => {});
    }
  }
}

// Event Listeners
bot.on("message:text", (ctx) => handleUserMessage(ctx, false));
bot.on("edited_message:text", (ctx) => handleUserMessage(ctx, true));

bot.catch((err) => {
  console.error("Bot Error Captured:", err.error);
});

bot.start({
  onStart: (botInfo) => {
    console.log(`🤖 Bot siap! Login sebagai @${botInfo.username}`);
  },
});
