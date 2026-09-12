import { InlineKeyboard } from "grammy";

export function setupStartCommand(bot) {
  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text(" Buka Fitur AI", "toggle_ai")
      .row()
      .text(" Panduan Bantuan", "show_help");

    await ctx.reply(
      " Halo! Aku bot Telegram yang siap bantu kamu ngobrol bareng AI.\n\nKlik tombol di bawah buat mulai atau cek bantuan.",
      { reply_markup: keyboard }
    );
  });
}
