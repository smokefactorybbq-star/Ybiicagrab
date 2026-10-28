type TelegramMessage = {
  text: string;
};

export async function notifyManagerTelegram({ text }: TelegramMessage) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.MANAGER_TELEGRAM_CHAT_ID || process.env.ADMIN_CHAT_ID;

  if (!token || !chatId) {
    console.log("[telegram] Manager notification skipped: Telegram variables are not configured.");
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      console.error("[telegram] Telegram API error", await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("[telegram] Notification failed", error);
    return false;
  }
}

export async function sendTelegramToUser(telegramId: string, text: string) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || !telegramId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text, disable_web_page_preview: true })
    });
    if (!response.ok) {
      console.error("[telegram] Customer message API error", await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[telegram] Customer message failed", error);
    return false;
  }
}
