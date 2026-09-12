import { InlineKeyboard } from "grammy";

export function setupHelpCommand(bot) {
  const getHelpText = () =>
    " **Panduan Penggunaan Bot:**\n\n" +
    "• `/start` - Menampilkan menu utama.\n" +
    "• `/ai on` - Mengaktifkan mode chat AI.\n" +
    "• `/ai off` - Mematikan mode chat AI.\n" +
    "• `/help` - Menampilkan panduan ini.\n\n" +
    " *Catatan:* Mode AI bakal otomatis mati kalau kamu diem selama 30 menit (session timeout). Edit pesan juga didukung buat minta AI perbarui jawaban!";

  bot.command("help", async (ctx) => {
    const keyboard = new InlineKeyboard()
      .text(" Nyalakan AI", "ai_on")
      .text(" Matikan AI", "ai_off");

    await ctx.reply(getHelpText(), { reply_markup: keyboard });
  });

  bot.callbackQuery("show_help", async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = new InlineKeyboard()
      .text(" Nyalakan AI", "ai_on")
      .text(" Matikan AI", "ai_off");

    await ctx.reply(getHelpText(), { reply_markup: keyboard });
  });
}
