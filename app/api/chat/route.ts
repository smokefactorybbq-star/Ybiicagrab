import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount } from "../../../lib/auth";
import { query, withTransaction } from "../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRow = { id: string };
type MessageRow = { id: string; sender_role: string; body: string; created_at: string };

async function ensureConversation(userId: string) {
  const result = await query<ConversationRow>(
    `INSERT INTO customer_conversations (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = customer_conversations.updated_at
     RETURNING id`,
    [userId]
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
      `UPDATE customer_messages SET read_by_customer_at = now()
       WHERE conversation_id = $1 AND sender_role = 'MANAGER' AND read_by_customer_at IS NULL`,
      [conversationId]
    );
  }
  const [messages, unread] = await Promise.all([
    query<MessageRow>(
      `SELECT id, sender_role, body, created_at::text
       FROM customer_messages WHERE conversation_id = $1
       ORDER BY created_at ASC LIMIT 300`,
      [conversationId]
    ),
    query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM customer_messages
       WHERE conversation_id = $1 AND sender_role = 'MANAGER' AND read_by_customer_at IS NULL`,
      [conversationId]
    )
  ]);
  return NextResponse.json({
    ok: true,
    unreadCount: Number(unread.rows[0]?.count || 0),
    messages: messages.rows.map((item) => ({ id: item.id, senderRole: item.sender_role, body: item.body, createdAt: item.created_at }))
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });
  const body = await request.json() as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) return NextResponse.json({ ok: false, error: "Сообщение должно содержать от 1 до 4000 символов" }, { status: 400 });

  const message = await withTransaction(async (client) => {
    const conversation = await client.query<ConversationRow>(
      `INSERT INTO customer_conversations (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING id`, [account.userId]
    );
    const result = await client.query<MessageRow>(
      `INSERT INTO customer_messages (conversation_id, sender_role, body, read_by_customer_at)
       VALUES ($1, 'CUSTOMER', $2, now())
       RETURNING id, sender_role, body, created_at::text`,
      [conversation.rows[0].id, text]
    );
    await client.query(`UPDATE customer_conversations SET updated_at = now() WHERE id = $1`, [conversation.rows[0].id]);
    return result.rows[0];
  });
  return NextResponse.json({ ok: true, message: { id: message.id, senderRole: message.sender_role, body: message.body, createdAt: message.created_at } }, { status: 201 });
}
