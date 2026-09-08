export async function GET() {
  return Response.json({ ok: true, service: "smokefactorybbq", timestamp: new Date().toISOString() });
}
