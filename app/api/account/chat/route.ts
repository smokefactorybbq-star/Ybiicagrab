import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query, withTransaction } from "../../../../lib/db";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { notifyManagerTelegram } from "../../../../lib/telegram";

import { readChatInput } from "../../../../lib/chat-upload";
import { consumeRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureConversation(userId: string) {
  return withTransaction(async(client)=>{
  await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`,[userId]);
  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM customer_conversations WHERE user_id = $1 ORDER BY updated_at DESC, created_at ASC LIMIT 1`, [userId]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const result = await client.query<{ id: string }>(
    `INSERT INTO customer_conversations (user_id) VALUES ($1) RETURNING id::text`, [userId]
  );
  return result.rows[0].id;
  });
}

export async function GET(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  const conversationId = await ensureConversation(account.userId);
  const markRead = request.nextUrl.searchParams.get("markRead") === "1";
  if (markRead) {
    await query(
      `UPDATE customer_messages SET read_by_customer_at = COALESCE(read_by_customer_at, now())
       WHERE conversation_id = $1 AND sender_role = 'MANAGER' AND read_by_customer_at IS NULL`,
      [conversationId]
    );
  }
  const messages = await query(
    `SELECT id::text, sender_role AS "senderRole", sender_name AS "senderName", body,
            CASE WHEN image_data IS NOT NULL THEN '/api/chat/images/' || id::text ELSE NULL END AS "imageUrl",
            CASE WHEN image_data IS NULL THEN NULL
                 WHEN substring(image_data from 1 for 5) = decode('255044462d','hex') THEN 'pdf'
                 ELSE 'image' END AS "attachmentType",
            created_at::text AS "createdAt"
     FROM customer_messages WHERE conversation_id = $1
     ORDER BY created_at DESC, id DESC LIMIT 400`,
    [conversationId]
  );
  const unread = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM customer_messages
     WHERE conversation_id = $1 AND sender_role = 'MANAGER' AND read_by_customer_at IS NULL`,
    [conversationId]
  );
  return NextResponse.json({ ok: true, messages: messages.rows.reverse(), unreadCount: unread.rows[0]?.count || 0 }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  try {
    const limit=await consumeRateLimit(`chat:${account.userId}`,30,60);
    if(!limit.allowed)return NextResponse.json({ok:false,error:"Слишком много сообщений. Подождите минуту."},{status:429});
    const {text,image,attachmentType}=await readChatInput(request);
    const conversationId = await withTransaction(async (client) => {
      await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`,[account.userId]);
      let conversation = await client.query<{ id: string }>(
        `SELECT id::text FROM customer_conversations WHERE user_id = $1 ORDER BY updated_at DESC, created_at ASC LIMIT 1 FOR UPDATE`, [account.userId]
      );
      if (!conversation.rows[0]) {
        conversation = await client.query<{ id: string }>(`INSERT INTO customer_conversations (user_id) VALUES ($1) RETURNING id::text`, [account.userId]);
      }
      const id = conversation.rows[0].id;
      await client.query(
        `INSERT INTO customer_messages (conversation_id, sender_role, sender_name, body, read_by_customer_at, image_data)
         VALUES ($1, 'CUSTOMER', $2, $3, now(), $4)`, [id, account.fullName, text, image]
      );
      await client.query(`UPDATE customer_conversations SET updated_at = now() WHERE id = $1`, [id]);
      return id;
    });
    const notificationBody = text || (attachmentType === "pdf" ? "📄 Клиент отправил PDF-файл" : attachmentType === "image" ? "📷 Клиент отправил изображение" : "Новое сообщение");
    void notifyManagerTelegram({ text: `<b>💬 MealPoint: сообщение клиента</b>\nКлиент: ${escapeHtml(account.fullName)}\n${escapeHtml(notificationBody)}` });
    return NextResponse.json({ ok: true, conversationId });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "FILE_TOO_LARGE") return NextResponse.json({ ok:false, error:"Файл должен быть не больше 5 МБ." }, { status:400 });
      if (error.message === "IMAGE_PIXELS_TOO_LARGE") return NextResponse.json({ ok:false, error:"Слишком большое разрешение изображения. Выберите другое фото." }, { status:400 });
      if (["BAD_MESSAGE","BAD_FILE","EMPTY_BODY"].includes(error.message)) return NextResponse.json({ ok:false, error:"Можно отправить текст до 4000 символов, фото JPG/PNG/WebP/HEIC/AVIF или PDF до 5 МБ." }, { status:400 });
    }
    console.error("Customer chat send failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось отправить сообщение" }, { status: 500 });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char] || char));
}
