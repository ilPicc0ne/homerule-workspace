// GET /api/resolve?q=<free text> → jurisdiction tree (docs/ARCHITECTURE.md, Web and API).
// Address, city, neighbourhood, county, state or ZIP. Same function as /where and the batch run.
import { resolveQuery } from "@/lib/resolve/resolve.ts";
import { sampleIndex } from "@/lib/resolve/samples.ts";

const STATUS = { address: 200, place: 200, ambiguous: 200, not_found: 404, unavailable: 503 } as const;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q");
  if (q === null) {
    return Response.json({ error: "Missing ?q= (an address, city, neighbourhood, county or state)", not_legal_advice: true }, { status: 400 });
  }
  const result = await resolveQuery(q.slice(0, 200), { fetch, samples: sampleIndex() });
  return Response.json(result, {
    status: STATUS[result.kind],
    headers: result.kind === "unavailable" ? {} : { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
