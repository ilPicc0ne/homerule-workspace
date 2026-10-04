// Public MCP server (Streamable HTTP, stateless, no Redis session store): https://yourhomerule.com/api/mcp
// Read-only tools over the same builders the pages use (lib/mcp/tools.ts). docs/ARCHITECTURE.md → MCP.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { clientIp } from "@/lib/alerts/server";
import { storeFromEnv } from "@/lib/alerts/store.ts";
import { getDataset } from "@/lib/data";
import { comparePlaces, coverage, getChanges, getPlace, getRule, INSTRUCTIONS, MAX_QUERY, type ToolAnswer, type ToolDeps } from "@/lib/mcp/tools.ts";
import { sampleIndex } from "@/lib/resolve/samples.ts";

export const maxDuration = 30;

/** Per IP per minute. Generous because claude.ai and ChatGPT call from shared cloud IPs. */
const RATE_LIMIT = 300;

function deps(): ToolDeps | null {
  const data = getDataset();
  return data ? { data, resolve: { fetch, samples: sampleIndex() } } : null;
}

/** MCP text content: the plain summary, then compact JSON. Errors are tool errors, never a 500. */
async function run(name: string, fn: (d: ToolDeps) => ToolAnswer | Promise<ToolAnswer>) {
  const d = deps();
  if (!d) {
    return { isError: true, content: [{ type: "text" as const, text: "HomeRule's data is not available right now. Not legal advice." }] };
  }
  try {
    const a = await fn(d);
    // Audit trail: tool, resolved ids, as_of. No IP, no query text.
    console.log(JSON.stringify({ mcp: name, ...a.log, error: a.error ? true : undefined, at: new Date().toISOString() }));
    return {
      ...(a.error ? { isError: true } : {}),
      content: [
        { type: "text" as const, text: a.summary },
        { type: "text" as const, text: JSON.stringify(a.payload) },
      ],
    };
  } catch (e) {
    console.error(JSON.stringify({ mcp: name, error: e instanceof Error ? e.message : String(e) }));
    return { isError: true, content: [{ type: "text" as const, text: "HomeRule hit an internal error answering this. Not legal advice." }] };
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const PRESENT =
  "Answer from this data: quote the law (verbatim, in quotes) and give its date and citation; never say compliant or illegal; name any unknown fact; don't compare the user's own rent, deposit or fee to a cap; link the HomeRule page; end with 'Not legal advice.'";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_place",
      {
        title: "Renter law for one address or place",
        description: `Use this for any question about one address, city, neighbourhood, ZIP or state: "What rent rules apply at 3515 Fillmore St, San Francisco?", "Can my landlord in Hoboken raise rent 10%?", "How much deposit in Newark?", "Was California's price-fixing software ban in force on 2025-06-01?" (pass as_of). One call is enough: no lookup step first. For a street address: the address page, decided per building (six topics with status, plain answer, the rules quoted with citation and dates, missing facts, who to ask, what's coming up). For a city or state: every rule at that level and above, by topic, each with status on as_of, dates, key value, summary, quote excerpt, citation, official source and rule page; which rule governs a building depends on its facts. Outside CA, NJ, MA it says HomeRule doesn't cover the place. ${PRESENT}`,
        inputSchema: z.object({
          place: z.string().min(1).max(MAX_QUERY).describe("Address, city, neighbourhood, ZIP, state, or a HomeRule id, e.g. '3515 Fillmore St, San Francisco', 'Hoboken, NJ', 'California', 'NJ-NEWARK', 'A0016'"),
          as_of: z.string().max(10).optional().describe("Date to answer for, YYYY-MM-DD; default the data's as-of date"),
        }),
        annotations: { ...readOnly, openWorldHint: true },
      },
      async (args) => run("get_place", (d) => getPlace(d, args)),
    );

    server.registerTool(
      "compare_places",
      {
        title: "Two places side by side",
        description: `Use this when the user compares two places or addresses or is moving: "I'm moving from Boston to San Francisco, how does my rent situation change?", "Newark or Jersey City for deposits?". One call returns both, topic by topic (rent increases, eviction, rent-setting software, deposits, application fees, screening), from the same data as get_place. Report side by side; don't rank or say one is better. ${PRESENT}`,
        inputSchema: z.object({
          a: z.string().min(1).max(MAX_QUERY).describe("First address or place, e.g. 'Boston, MA'"),
          b: z.string().min(1).max(MAX_QUERY).describe("Second address or place, e.g. 'San Francisco, CA'"),
          as_of: z.string().max(10).optional().describe("Date to answer for, YYYY-MM-DD"),
        }),
        annotations: { ...readOnly, openWorldHint: true },
      },
      async (args) => run("compare_places", (d) => comparePlaces(d, args)),
    );

    server.registerTool(
      "get_changes",
      {
        title: "What changed or is changing",
        description: `Use this when the user asks what changed, what is changing, what's new or what's coming for a place or address: "What's changing for renters in Newark?", "Anything coming up at 327 Jackson St, Hoboken?". For an address: its change log, each change with date, old → new, rule, verbatim quote, citation, official link and the renter-impact badge (↑ adds / ↓ narrows protection / ? depends) when HomeRule's engine computed one. For a city or state: the changes across HomeRule's sample addresses there, grouped by rule with how many addresses each affects and the badge counts. Optional from/to (YYYY-MM-DD). Demo/fictional sources are labelled: say they are not real law. ${PRESENT}`,
        inputSchema: z.object({
          place: z.string().max(MAX_QUERY).optional().describe("Address, city or state, e.g. 'Newark, NJ' or '327 Jackson St, Hoboken'"),
          address_id: z.string().max(16).optional().describe("Instead of place: a sample address id, e.g. A0003"),
          jurisdiction_id: z.string().max(40).optional().describe("Instead of place: a city or state id, e.g. NJ-NEWARK"),
          from: z.string().max(10).optional().describe("Earliest date, YYYY-MM-DD"),
          to: z.string().max(10).optional().describe("Latest date, YYYY-MM-DD"),
        }),
        annotations: { ...readOnly, openWorldHint: true },
      },
      async (args) => run("get_changes", (d) => getChanges(d, args)),
    );

    server.registerTool(
      "get_rule",
      {
        title: "One law in depth",
        description: `Use this only when the user wants depth on one specific law that get_place, compare_places or get_changes already named (by rule_id): its full quote with context, status history, exemptions, interaction with other levels, open questions, the model-vs-code audit trail, or which and how many sample buildings it reaches ("Which buildings would bill S.2983 reach?"). Not needed for ordinary questions: get_place already carries each rule's status, key value and quote. ${PRESENT}`,
        inputSchema: z.object({
          rule_id: z.string().min(1).max(80).describe("Rule id, e.g. NJ-ALG-56:9-23 or MA-ALG-2983"),
          as_of: z.string().max(10).optional().describe("Date for the status, YYYY-MM-DD"),
        }),
        annotations: readOnly,
      },
      async (args) => run("get_rule", (d) => getRule(d, args)),
    );

    server.registerTool(
      "coverage",
      {
        title: "What HomeRule covers",
        description: "Use this when the user asks what HomeRule covers or where it works: the 3 states and 10 cities, the six topics, example addresses, the data's as-of date, and what is not covered.",
        inputSchema: z.object({}),
        annotations: readOnly,
      },
      async () => run("coverage", (d) => coverage(d)),
    );
  },
  { serverInfo: { name: "homerule", version: "2.0.0" }, instructions: INSTRUCTIONS },
);

async function limited(req: Request): Promise<Response> {
  const store = storeFromEnv();
  if (store && req.method === "POST") {
    try {
      const n = await store.hit(`mcp:rl:${clientIp(req)}:${Math.floor(Date.now() / 60_000)}`, 60);
      if (n > RATE_LIMIT) {
        return Response.json(
          { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests; try again in a minute." } },
          { status: 429, headers: { "Retry-After": "60" } },
        );
      }
    } catch {
      // Redis down: serve rather than block (read-only, public data).
    }
  }
  return handler(req);
}

export { limited as GET, limited as POST, limited as DELETE };
