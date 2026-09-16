import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../../lib/auth";
import { query, withTransaction } from "../../../../lib/db";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { notifyManagerTelegram } from "../../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureConversation(userId: string) {
  const existing = await query<{ id: string }>(
    `SELECT id::text FROM customer_conversations WHERE user_id = $1 ORDER BY updated_at DESC, created_at ASC LIMIT 1`, [userId]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const result = await query<{ id: string }>(
    `INSERT INTO customer_conversations (user_id) VALUES ($1) RETURNING id::text`, [userId]
  );
  return result.rows[0].id;
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
            created_at::text AS "createdAt"
     FROM customer_messages WHERE conversation_id = $1
     ORDER BY created_at ASC, id ASC LIMIT 400`,
    [conversationId]
  );
  const unread = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM customer_messages
     WHERE conversation_id = $1 AND sender_role = 'MANAGER' AND read_by_customer_at IS NULL`,
    [conversationId]
  );
  return NextResponse.json({ ok: true, messages: messages.rows, unreadCount: unread.rows[0]?.count || 0 }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  try {
    const body = await request.json() as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000) return NextResponse.json({ ok: false, error: "Сообщение должно содержать от 1 до 4000 символов" }, { status: 400 });
    const conversationId = await withTransaction(async (client) => {
      let conversation = await client.query<{ id: string }>(
        `SELECT id::text FROM customer_conversations WHERE user_id = $1 ORDER BY updated_at DESC, created_at ASC LIMIT 1 FOR UPDATE`, [account.userId]
      );
      if (!conversation.rows[0]) {
        conversation = await client.query<{ id: string }>(`INSERT INTO customer_conversations (user_id) VALUES ($1) RETURNING id::text`, [account.userId]);
      }
      const id = conversation.rows[0].id;
      await client.query(
        `INSERT INTO customer_messages (conversation_id, sender_role, sender_name, body, read_by_customer_at)
         VALUES ($1, 'CUSTOMER', $2, $3, now())`, [id, account.fullName, text]
      );
      await client.query(`UPDATE customer_conversations SET updated_at = now() WHERE id = $1`, [id]);
      return id;
    });
    void notifyManagerTelegram({ text: `<b>💬 MealPoint: сообщение клиента</b>\nКлиент: ${escapeHtml(account.fullName)}\n${escapeHtml(text)}` });
    return NextResponse.json({ ok: true, conversationId });
  } catch (error) {
    console.error("Customer chat send failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось отправить сообщение" }, { status: 500 });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char] || char));
}
