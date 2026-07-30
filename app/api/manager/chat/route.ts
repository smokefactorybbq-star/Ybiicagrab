import { NextResponse } from "next/server";
import { query, withTransaction } from "../../../../lib/db";
import { authorizeManager } from "../../../../lib/manager-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRow = { id: string };
type MessageRow = { id: string; sender_role: string; body: string; created_at: string };

async function customerExists(userId: string) {
  const result = await query<{ id: string; full_name: string; phone: string | null }>(
    `SELECT id, full_name, phone FROM users WHERE id = $1 AND role = 'CUSTOMER' LIMIT 1`, [userId]
  );
  return result.rows[0] || null;
}

export async function GET(request: Request) {
  const auth = authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim() || "";
  if (!userId) return NextResponse.json({ ok: false, error: "Не выбран клиент" }, { status: 400 });
  const customer = await customerExists(userId);
  if (!customer) return NextResponse.json({ ok: false, error: "Клиент не найден" }, { status: 404 });
  const conversation = await query<ConversationRow>(
    `INSERT INTO customer_conversations (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = customer_conversations.updated_at
     RETURNING id`, [userId]
  );
  const conversationId = conversation.rows[0].id;
  if (url.searchParams.get("markRead") === "1") {
    await query(
      `UPDATE customer_messages SET read_by_manager_at = now()
       WHERE conversation_id = $1 AND sender_role = 'CUSTOMER' AND read_by_manager_at IS NULL`, [conversationId]
    );
  }
  const [messages, unread] = await Promise.all([
    query<MessageRow>(
      `SELECT id, sender_role, body, created_at::text FROM customer_messages
       WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 300`, [conversationId]
    ),
    query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM customer_messages
       WHERE conversation_id = $1 AND sender_role = 'CUSTOMER' AND read_by_manager_at IS NULL`, [conversationId]
    )
  ]);
  return NextResponse.json({
    ok: true,
    customer: { userId: customer.id, fullName: customer.full_name, phone: customer.phone },
    unreadCount: Number(unread.rows[0]?.count || 0),
    messages: messages.rows.map((item) => ({ id: item.id, senderRole: item.sender_role, body: item.body, createdAt: item.created_at }))
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await request.json() as { userId?: unknown; text?: unknown };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!userId || !text || text.length > 4000) return NextResponse.json({ ok: false, error: "Не выбран клиент или сообщение пустое" }, { status: 400 });
  if (!await customerExists(userId)) return NextResponse.json({ ok: false, error: "Клиент не найден" }, { status: 404 });

  const message = await withTransaction(async (client) => {
    const conversation = await client.query<ConversationRow>(
      `INSERT INTO customer_conversations (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING id`, [userId]
    );
    const result = await client.query<MessageRow>(
      `INSERT INTO customer_messages (conversation_id, sender_role, body, read_by_manager_at)
       VALUES ($1, 'MANAGER', $2, now())
       RETURNING id, sender_role, body, created_at::text`, [conversation.rows[0].id, text]
    );
    await client.query(`UPDATE customer_conversations SET updated_at = now() WHERE id = $1`, [conversation.rows[0].id]);
    return result.rows[0];
  });
  return NextResponse.json({ ok: true, message: { id: message.id, senderRole: message.sender_role, body: message.body, createdAt: message.created_at } }, { status: 201 });
}
