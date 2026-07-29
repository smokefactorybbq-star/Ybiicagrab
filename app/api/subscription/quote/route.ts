type QuoteRequest = { selectedDays?: number };

export async function POST(request: Request) {
  const body = (await request.json()) as QuoteRequest;
  const selectedDays = Math.min(30, Math.max(0, Number(body.selectedDays || 0)));
  const rate = selectedDays === 0 ? 0 : selectedDays >= 30 ? 250 : selectedDays >= 7 ? 300 : 350;
  return Response.json({ selectedDays, rate, total: selectedDays * rate });
}
