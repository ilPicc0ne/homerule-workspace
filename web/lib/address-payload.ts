import { DATA_SOURCE, DATA_SOURCE_LABEL } from "./config.ts";
import type { Dataset, Meta } from "./types";

/*
  The JSON for one sample address (interface I5), shared by GET /api/address/[id] and the MCP tool
  get_rules. Pure (no server-only import), so node --test can load it.
*/

export const DISCLAIMER =
  "Not legal advice. Shows published housing rules that may apply to this address, with quotes and dates. Not a compliance certification.";

export function base() {
  return { not_legal_advice: true as const, disclaimer: DISCLAIMER, data_source: DATA_SOURCE, data_label: DATA_SOURCE_LABEL[DATA_SOURCE] };
}

/** Snap a requested date to the published list: the latest listed date on or before it. */
export function snapAsOf(meta: Meta, requested: string | null | undefined): string {
  const dates = meta.as_of_dates.map((d) => d.date);
  if (!requested) return meta.default_as_of;
  if (dates.includes(requested)) return requested;
  const earlier = dates.filter((d) => d <= requested);
  return earlier.length ? earlier[earlier.length - 1] : dates[0];
}

export const AS_OF_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Payload = { status: number; body: Record<string, unknown> };

export function addressPayload(data: Dataset | null, id: string, requested: string | null): Payload {
  if (!data) {
    return { status: 503, body: { ...base(), error: "Live data not available yet; it arrives with the rule engine." } };
  }
  if (requested && !AS_OF_RE.test(requested)) {
    return { status: 400, body: { ...base(), error: "as_of must look like YYYY-MM-DD." } };
  }
  const asOf = snapAsOf(data.meta, requested);
  const asOfDates = data.meta.as_of_dates.map((d) => d.date);

  const address = data.addresses.find((a) => a.address_id === id);
  if (!address) {
    return { status: 404, body: { ...base(), as_of: asOf, error: `Unknown address id ${id}.` } };
  }
  if (!address.demo) {
    return {
      status: 404,
      body: {
        ...base(),
        as_of: asOf,
        address_id: id,
        error: "This sample address has no demo results yet; they come with the rule engine.",
        jurisdictions: address.jurisdictions,
      },
    };
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
        effective_dates_disputed: rule.effective_dates_disputed,
        source_doc_id: rule.source_doc_id,
        source_url: rule.source_url,
        retrieved_at: rule.retrieved_at,
        quoted_span: rule.quoted_span,
      },
    };
  });

  return {
    status: 200,
    body: {
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
    },
  };
}
