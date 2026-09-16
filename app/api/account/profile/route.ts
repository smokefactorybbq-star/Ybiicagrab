import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedAccount, normalizeContactPhone } from "../../../../lib/auth";
import { withTransaction } from "../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function phoneAliases(phone: string) {
  const values = new Set<string>();
  const normalized = phone.trim();
  if (!normalized) return [];
  values.add(normalized);
  if (normalized.startsWith("+66") && normalized.length > 3) {
    values.add(`0${normalized.slice(3)}`);
    values.add(`0066${normalized.slice(3)}`);
  } else if (normalized.startsWith("0") && normalized.length > 1) {
    values.add(`+66${normalized.slice(1)}`);
    values.add(`0066${normalized.slice(1)}`);
  } else if (normalized.startsWith("0066") && normalized.length > 4) {
    values.add(`+66${normalized.slice(4)}`);
    values.add(`0${normalized.slice(4)}`);
  }
  return Array.from(values);
}

export async function PATCH(request: NextRequest) {
  const account = await getAuthenticatedAccount(request);
  if (!account) return NextResponse.json({ ok: false, error: "Требуется вход" }, { status: 401 });

  try {
    const body = await request.json() as { fullName?: unknown; phone?: unknown; address?: unknown };
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const rawPhone = typeof body.phone === "string" ? body.phone.trim() : account.phone;
    const phone = rawPhone ? normalizeContactPhone(rawPhone) : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (fullName.length < 2) return NextResponse.json({ ok: false, error: "Укажите имя" }, { status: 400 });
    if (rawPhone && !phone) return NextResponse.json({ ok: false, error: "Введите корректный телефон" }, { status: 400 });

    const result = await withTransaction(async (client) => {
      let legacyLinked = false;
      let movedSubscriptions = 0;
      let movedConversations = 0;

      if (phone) {
        const aliases = phoneAliases(phone);
        const legacy = await client.query<{
          id: string;
          terms_accepted_at: string | null;
          terms_version: string | null;
        }>(
          `SELECT u.id::text AS id,
                  ca.terms_accepted_at::text AS terms_accepted_at,
                  ca.terms_version
           FROM users u
           LEFT JOIN customer_accounts ca ON ca.user_id = u.id
           WHERE u.id <> $2::uuid
             AND (
               regexp_replace(COALESCE(u.phone,''), '[^0-9+]', '', 'g') = ANY($1::text[])
               OR regexp_replace(COALESCE(ca.phone,''), '[^0-9+]', '', 'g') = ANY($1::text[])
               OR EXISTS (
                 SELECT 1 FROM subscriptions s
                 WHERE s.user_id = u.id
                   AND regexp_replace(COALESCE(s.customer_phone,''), '[^0-9+]', '', 'g') = ANY($1::text[])
               )
             )
           ORDER BY
             (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id = u.id) DESC,
             (SELECT COUNT(*) FROM customer_conversations cc WHERE cc.user_id = u.id) DESC,
             u.created_at ASC
           LIMIT 1
           FOR UPDATE OF u`,
          [aliases, account.userId]
        );

        const legacyAccount = legacy.rows[0];
        if (legacyAccount) {
          const movedSubs = await client.query(
            `UPDATE subscriptions SET user_id = $1, updated_at = now() WHERE user_id = $2`,
            [account.userId, legacyAccount.id]
          );
          const movedChats = await client.query(
            `UPDATE customer_conversations SET user_id = $1, updated_at = now() WHERE user_id = $2`,
            [account.userId, legacyAccount.id]
          );
          movedSubscriptions = movedSubs.rowCount || 0;
          movedConversations = movedChats.rowCount || 0;
          legacyLinked = movedSubscriptions > 0 || movedConversations > 0;

          if (legacyAccount.terms_accepted_at) {
            await client.query(
              `INSERT INTO customer_accounts (user_id, phone, password_hash, terms_version, terms_accepted_at)
               VALUES ($1, $2, '', COALESCE($3,'2026-08-13'), $4::timestamptz)
               ON CONFLICT (user_id) DO UPDATE SET
                 phone = EXCLUDED.phone,
                 terms_accepted_at = COALESCE(customer_accounts.terms_accepted_at, EXCLUDED.terms_accepted_at),
                 terms_version = CASE
                   WHEN customer_accounts.terms_accepted_at IS NULL THEN EXCLUDED.terms_version
                   ELSE customer_accounts.terms_version
                 END,
                 updated_at = now()`,
              [account.userId, phone, legacyAccount.terms_version, legacyAccount.terms_accepted_at]
            );
          }
        }
      }

      await client.query(
        `UPDATE users SET full_name = $1, profile_name = $1, phone = $2, address = $3, updated_at = now() WHERE id = $4`,
        [fullName, phone, address, account.userId]
      );
      await client.query(
        `INSERT INTO customer_accounts (user_id, phone, password_hash)
         VALUES ($1, $2, '')
         ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone, updated_at = now()`,
        [account.userId, phone]
      );

      if (legacyLinked) {
        await client.query(
          `INSERT INTO manager_events (event_type, entity_id, payload)
           VALUES ('TELEGRAM_LEGACY_ACCOUNT_LINKED', $1, $2::jsonb)`,
          [account.userId, JSON.stringify({ movedSubscriptions, movedConversations, phone })]
        );
      }

      return { legacyLinked, movedSubscriptions, movedConversations };
    });

    return NextResponse.json({
      ok: true,
      account: { ...account, fullName, phone, address },
      ...result
    });
  } catch (error) {
    console.error("Profile update failed", error);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить профиль" }, { status: 500 });
  }
}
