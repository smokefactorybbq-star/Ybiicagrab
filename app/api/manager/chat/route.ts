import { NextResponse } from "next/server";
import { authorizeManager } from "../../../../lib/manager-auth";
import { query, withTransaction } from "../../../../lib/db";
import { isSameOriginMutation } from "../../../../lib/request-security";
import { sendTelegramToUser } from "../../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureConversation(userId: string) {
  const existing = await query<{ id: string }>(
    `SELECT id::text FROM customer_conversations WHERE user_id = $1 ORDER BY updated_at DESC, created_at ASC LIMIT 1`, [userId]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const result = await query<{ id: string }>(`INSERT INTO customer_conversations (user_id) VALUES ($1) RETURNING id::text`, [userId]);
  return result.rows[0].id;
}

export async function GET(request: Request) {
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const url = new URL(request.url);
  const userId = (url.searchParams.get("userId") || "").trim();
  if (!userId) return NextResponse.json({ ok: false, error: "Не указан клиент" }, { status: 400 });
  const user = await query<{ fullName: string; phone: string | null }>(
    `SELECT COALESCE(NULLIF(full_name,''), NULLIF(profile_name,''), 'Клиент') AS "fullName", phone FROM users WHERE id = $1 LIMIT 1`, [userId]
  );
  if (!user.rows[0]) return NextResponse.json({ ok: false, error: "Клиент не найден" }, { status: 404 });
  const conversationId = await ensureConversation(userId);
  if (url.searchParams.get("markRead") === "1") {
    await query(
      `UPDATE customer_messages SET read_by_manager_at = COALESCE(read_by_manager_at, now())
       WHERE conversation_id = $1 AND sender_role = 'CUSTOMER' AND read_by_manager_at IS NULL`, [conversationId]
    );
  }
  const messages = await query(
    `SELECT id::text, sender_role AS "senderRole", sender_name AS "senderName", body, created_at::text AS "createdAt"
     FROM customer_messages WHERE conversation_id = $1 ORDER BY created_at ASC, id ASC LIMIT 400`, [conversationId]
  );
  return NextResponse.json({ ok: true, customer: user.rows[0], messages: messages.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return NextResponse.json({ ok: false, error: "Недопустимый источник запроса" }, { status: 403 });
  const auth = await authorizeManager(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const body = await request.json() as { userId?: unknown; text?: unknown };
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!userId || !text || text.length > 4000) return NextResponse.json({ ok: false, error: "Некорректное сообщение" }, { status: 400 });
    const sent = await withTransaction(async (client) => {
      const user = await client.query<{ telegram_id: string | null; full_name: string }>(
        `SELECT telegram_id::text, COALESCE(NULLIF(full_name,''), NULLIF(profile_name,''), 'Клиент') AS full_name FROM users WHERE id = $1 FOR UPDATE`, [userId]
      );
      if (!user.rows[0]) throw new Error("NOT_FOUND");
      let conversation = await client.query<{ id: string }>(
        `SELECT id::text FROM customer_conversations WHERE user_id = $1 ORDER BY updated_at DESC, created_at ASC LIMIT 1 FOR UPDATE`, [userId]
      );
      if (!conversation.rows[0]) {
        conversation = await client.query<{ id: string }>(`INSERT INTO customer_conversations (user_id) VALUES ($1) RETURNING id::text`, [userId]);
      }
      const conversationId = conversation.rows[0].id;
      await client.query(
        `INSERT INTO customer_messages (conversation_id, sender_role, sender_name, body, read_by_manager_at)
         VALUES ($1, 'MANAGER', $2, $3, now())`, [conversationId, auth.username, text]
      );
      await client.query(`UPDATE customer_conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
      return { telegramId: user.rows[0].telegram_id, fullName: user.rows[0].full_name };
    });
    if (sent.telegramId) void sendTelegramToUser(sent.telegramId, `💬 MealPoint\n${text}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return NextResponse.json({ ok: false, error: "Клиент не найден" }, { status: 404 });
    console.error("Manager chat send failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось отправить сообщение" }, { status: 500 });
  }
}
