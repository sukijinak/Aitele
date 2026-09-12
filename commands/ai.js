import { InlineKeyboard } from "grammy";

export function setupAiCommand(bot, sessions) {
  const getAiKeyboard = (isActive) => {
    return new InlineKeyboard().text(
      isActive ? " Matikan AI" : " Nyalakan AI",
      isActive ? "ai_off" : "ai_on"
    );
  };

  bot.command("ai", async (ctx) => {
    const arg = ctx.match?.trim().toLowerCase();
    const userId = ctx.from.id;
    const session = sessions.get(userId) || { isActive: false };

    if (arg === "on") {
      sessions.set(userId, { isActive: true, lastInteraction: Date.now() });
      await ctx.reply(" Mode AI berhasil **DIPIKIRKAN/DIAKTIFKAN**! Silakan kirim pesan atau pertanyaan kamu.", {
        reply_markup: getAiKeyboard(true),
      });
    } else if (arg === "off") {
      sessions.set(userId, { isActive: false, lastInteraction: Date.now() });
      await ctx.reply(" Mode AI **DIMATIKAN**. Kirim `/ai on` kalau mau ngobrol lagi.", {
        reply_markup: getAiKeyboard(false),
      });
    } else {
      const statusText = session.isActive ? "AKTIF " : "NONAKTIF ";
      await ctx.reply(`Status mode AI kamu saat ini: **${statusText}**\n\nPilih opsi di bawah untuk mengubah:`, {
        reply_markup: getAiKeyboard(session.isActive),
      });
    }
  });

  bot.callbackQuery("toggle_ai", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const session = sessions.get(userId) || { isActive: false };
    const newState = !session.isActive;

    sessions.set(userId, { isActive: newState, lastInteraction: Date.now() });
    const text = newState
      ? " Mode AI berhasil **DIAKTIFKAN**! Silakan tanyakan apa saja."
      : " Mode AI **DIMATIKAN**.";

    await ctx.reply(text, { reply_markup: getAiKeyboard(newState) });
  });

  bot.callbackQuery("ai_on", async (ctx) => {
    await ctx.answerCallbackQuery("Mode AI Aktif");
    const userId = ctx.from.id;
    sessions.set(userId, { isActive: true, lastInteraction: Date.now() });
    await ctx.reply(" Mode AI **DIAKTIFKAN**! Silakan kirim pesan kamu.", {
      reply_markup: getAiKeyboard(true),
    });
  });

  bot.callbackQuery("ai_off", async (ctx) => {
    await ctx.answerCallbackQuery("Mode AI Matikan");
    const userId = ctx.from.id;
    sessions.set(userId, { isActive: false, lastInteraction: Date.now() });
    await ctx.reply(" Mode AI **DIMATIKAN**.", {
      reply_markup: getAiKeyboard(false),
    });
  });
}
