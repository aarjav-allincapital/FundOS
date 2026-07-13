import { NextResponse } from "next/server";

const SUPPORTED = new Set(["USD", "INR", "EUR", "GBP"]);

const FX_PROVIDER = "https://api.frankfurter.app";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.toUpperCase();
  const to = searchParams.get("to")?.toUpperCase();
  const date = searchParams.get("date");

  if (!from || !to || !date) {
    return NextResponse.json(
      { error: "from, to, and date are required" },
      { status: 400 }
    );
  }

  if (from === to) {
    return NextResponse.json({
      rate: 1,
      rate_date: date,
      from_currency: from,
      to_currency: to,
    });
  }

  if (!SUPPORTED.has(from) || !SUPPORTED.has(to)) {
    return NextResponse.json(
      { error: `Unsupported currency pair: ${from}/${to}` },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const endpoint =
    date === "latest" || date > today
      ? `${FX_PROVIDER}/latest?from=${from}&to=${to}`
      : `${FX_PROVIDER}/${date}?from=${from}&to=${to}`;

  try {
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `FX provider error (${res.status})` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      date: string;
      rates: Record<string, number>;
    };
    const rate = data.rates[to];
    if (rate == null) {
      return NextResponse.json(
        { error: `No rate returned for ${from}/${to}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      rate,
      rate_date: data.date,
      from_currency: from,
      to_currency: to,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach FX provider" },
      { status: 502 }
    );
  }
}
