export async function GET() {
  return Response.json({ ok: true, service: "mealpoint", timestamp: new Date().toISOString() });
}
