import type { NextRequest } from "next/server";
import { getDataset, snapAsOf } from "@/lib/data";
import { DATA_SOURCE, DATA_SOURCE_LABEL } from "@/lib/config";

/*
  GET /api/address/<id>?as_of=YYYY-MM-DD  (interface I5)
  Same results as the address page, with as_of, retrieval dates and not_legal_advice.
  The date snaps to the published list (latest listed date on or before the request).
*/

const DISCLAIMER =
  "Not legal advice. Shows published housing rules that may apply to this address, with quotes and dates. Not a compliance certification.";

function base() {
  return { not_legal_advice: true, disclaimer: DISCLAIMER, data_source: DATA_SOURCE, data_label: DATA_SOURCE_LABEL[DATA_SOURCE] };
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/address/[id]">) {
  const { id } = await ctx.params;
  const data = getDataset();
  if (!data) {
    return Response.json({ ...base(), error: "Live data not available yet; it arrives with the rule engine." }, { status: 503 });
  }

  const requested = req.nextUrl.searchParams.get("as_of");
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
    return Response.json({ ...base(), error: "as_of must look like YYYY-MM-DD." }, { status: 400 });
  }
  const asOf = snapAsOf(data.meta, requested);
  const asOfDates = data.meta.as_of_dates.map((d) => d.date);

  const address = data.addresses.find((a) => a.address_id === id);
  if (!address) {
    return Response.json({ ...base(), as_of: asOf, error: `Unknown address id ${id}.` }, { status: 404 });
  }
  if (!address.demo) {
    return Response.json(
      {
        ...base(),
        as_of: asOf,
        address_id: id,
        error: "This sample address has no demo results yet; they come with the rule engine.",
        jurisdictions: address.jurisdictions,
      },
      { status: 404 },
    );
  }

  const rules = new Map(data.rules.map((r) => [r.rule_id, r]));
  const results = (data.lookups[asOf]?.[id] ?? []).map((r) => {
    const rule = rules.get(r.rule_id);
    return {
      ...r,
      rule: rule && {
        title: rule.title,
        jurisdiction: rule.schema_name,
        level: rule.level,
        citation: rule.citation,
        status: rule.status,
        effective_date: rule.effective_date,
        effective_until: rule.effective_until ?? null,
        effective_dates_disputed: rule.effective_dates_disputed,
        source_doc_id: rule.source_doc_id,
        source_url: rule.source_url,
        retrieved_at: rule.retrieved_at,
        quoted_span: rule.quoted_span,
      },
    };
  });

  return Response.json({
    ...base(),
    as_of: asOf,
    ...(requested && requested !== asOf ? { as_of_requested: requested } : {}),
    as_of_dates: asOfDates,
    address: {
      address_id: address.address_id,
      street: address.street,
      postal_city: address.postal_city,
      jurisdictions: address.jurisdictions,
      legal_city_note: address.legal_city_note ?? null,
      facts: address.facts,
      coords: address.coords,
    },
    results,
  });
}
