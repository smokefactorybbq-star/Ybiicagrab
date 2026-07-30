export function authorizeManager(request: Request) {
  const configuredPassword = process.env.MANAGER_PASSWORD;
  const suppliedPassword = request.headers.get("x-manager-password");

  if (!configuredPassword) return { ok: false as const, error: "MANAGER_PASSWORD не задан", status: 503 };
  if (suppliedPassword !== configuredPassword) return { ok: false as const, error: "Неверный пароль", status: 401 };
  return { ok: true as const, error: "", status: 200 };
}
