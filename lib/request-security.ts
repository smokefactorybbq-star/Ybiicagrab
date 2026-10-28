function firstForwardedValue(value: string | null) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

export function isSameOriginMutation(request: Request) {
  const method = request.method.toUpperCase();

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const originHeader = (request.headers.get("origin") || "").trim();

  if (!originHeader) {
    return false;
  }

  let origin: URL;
  let requestUrl: URL;

  try {
    origin = new URL(originHeader);
    requestUrl = new URL(request.url);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return false;
  }

  const configured=(process.env.MEALPOINT_PUBLIC_URL||process.env.NEXT_PUBLIC_SITE_URL||"").trim();
  if(configured){try{return origin.origin===new URL(configured.includes("://")?configured:`https://${configured}`).origin;}catch{return false;}}
  if(process.env.NODE_ENV==="production")return false;
  const forwardedHost = firstForwardedValue(
    request.headers.get("x-forwarded-host")
  );

  const host =
    forwardedHost ||
    firstForwardedValue(request.headers.get("host"));

  const forwardedProto = firstForwardedValue(
    request.headers.get("x-forwarded-proto")
  ).toLowerCase();

  const protocol =
    forwardedProto ||
    requestUrl.protocol.replace(":", "").toLowerCase();

  if (
    !host ||
    (protocol !== "https" && protocol !== "http")
  ) {
    return false;
  }

  const expectedOrigin = `${protocol}://${host}`;

  try {
    return origin.origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}
