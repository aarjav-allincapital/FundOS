import { NextResponse } from "next/server";
import { domainFromWebsite } from "@/lib/company-logo";
import { resolveCompanyLogoWebp } from "@/lib/company-logo-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Return the resolved favicon WebP for live preview while editing a company. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const website = searchParams.get("website")?.trim();
  const label = searchParams.get("label")?.trim() || undefined;

  if (!website || !domainFromWebsite(website)) {
    return NextResponse.json({ error: "Valid website URL is required." }, { status: 400 });
  }

  try {
    const webp = await resolveCompanyLogoWebp(website, label);
    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
