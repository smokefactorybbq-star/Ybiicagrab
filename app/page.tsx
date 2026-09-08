import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Home({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  const blockedLegacyAuthParams = new Set(["u", "s", "tg_user", "tg_sig"]);
  for (const [key, value] of Object.entries(params || {})) {
    if (blockedLegacyAuthParams.has(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/shop.html${suffix ? `?${suffix}` : ""}`);
}
