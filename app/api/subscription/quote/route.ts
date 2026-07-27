type QuoteRequest = { selectedDays?: number; daysInMonth?: number };

export async function POST(request: Request) {
  const body = (await request.json()) as QuoteRequest;
  const selectedDays = Math.max(0, Number(body.selectedDays || 0));
  const daysInMonth = Math.max(28, Number(body.daysInMonth || 30));
  const rate = selectedDays === 0 ? 0 : selectedDays === daysInMonth ? 250 : selectedDays >= 7 ? 300 : 350;
  return Response.json({ selectedDays, rate, total: selectedDays * rate, currency: "THB" });
}

