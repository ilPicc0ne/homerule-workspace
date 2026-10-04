// Public MCP server (Streamable HTTP, stateless, no Redis session store): https://yourhomerule.com/api/mcp
// Read-only tools over the same builders the pages use (lib/mcp/tools.ts). docs/ARCHITECTURE.md → MCP.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { clientIp } from "@/lib/alerts/server";
import { storeFromEnv } from "@/lib/alerts/store.ts";
import { getDataset } from "@/lib/data";
import { coverage, findPlace, getAddress, getChanges, getJurisdiction, getRule, getRules, INSTRUCTIONS, MAX_QUERY, type ToolAnswer, type ToolDeps } from "@/lib/mcp/tools.ts";
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

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "find_place",
      {
        title: "Find a place or address",
        description:
          "Resolve a US address, city, neighbourhood, county, state or ZIP to its legal jurisdictions (State › County › City). Says whether HomeRule covers it, the legal city when it differs from the postal city, building facts for a sample address, and the sample address_id if it is one of HomeRule's 500 sample addresses. Use first for anything the user names; then get_address (an address), get_jurisdiction (a city or state) or get_changes (what changed).",
        inputSchema: z.object({ query: z.string().min(1).max(MAX_QUERY).describe("Address or place, e.g. '471 Columbia Rd, Dorchester, MA' or 'Hoboken, NJ'") }),
        annotations: { ...readOnly, openWorldHint: true },
      },
      async ({ query }) => run("find_place", (d) => findPlace(d, query)),
    );

    server.registerTool(
      "get_address",
      {
        title: "Everything HomeRule's address page shows",
        description:
          "Use when the user asks about their home or a specific street address. Returns the address page: legal vs postal city and jurisdiction stack, building facts with their source, the six topics (rent increases, eviction, rent-setting software, deposit, application fees, screening) each with a status label, plain answer, the law (verbatim quote, citation, official source URL, effective dates), missing facts, conflict flags, who to ask (with source and retrieval date) and neutral helpers; plus coming up / recently changed and proposed bills (not law). Pass address_id (a sample address from find_place) or query (any street address; outside the 500 samples the answer is provisional with building facts unknown). Optional as_of (YYYY-MM-DD).",
        inputSchema: z.object({
          address_id: z.string().max(16).optional().describe("Sample address id from find_place, e.g. A0256"),
          query: z.string().max(MAX_QUERY).optional().describe("A street address, e.g. '280 Grove St, Jersey City, NJ'"),
          as_of: z.string().max(10).optional().describe("Date to answer for, YYYY-MM-DD; default the data's as-of date"),
        }),
        annotations: { ...readOnly, openWorldHint: true },
      },
      async (args) => run("get_address", (d) => getAddress(d, args)),
    );

    server.registerTool(
      "get_changes",
      {
        title: "What changed in the law (change log)",
        description:
          "Use when the user asks what changed, what is changing or what is new. For an address: HomeRule's change log, each change with its date, source (date comparison or new document; demo/fictional sources labelled), old → new result, rule, verbatim quote, citation and official link. For a city or state: the same changes across HomeRule's sample addresses there, grouped by rule with how many addresses each affects. Pass one of address_id, jurisdiction_id or query; optional from/to (YYYY-MM-DD) filter by the date the change is seen.",
        inputSchema: z.object({
          address_id: z.string().max(16).optional().describe("Sample address id, e.g. A0003"),
          jurisdiction_id: z.string().max(40).optional().describe("City or state id, e.g. NJ-NEWARK or NJ"),
          query: z.string().max(MAX_QUERY).optional().describe("An address or place, e.g. 'Newark, NJ'"),
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
        title: "One rule in full (rule page)",
        description:
          "Use when the user asks about one specific law (a rule_id from get_address, get_jurisdiction or get_changes). Returns the rule page: status and status history, dates, verbatim quote, citation, official source URL, who it covers in words, exemptions, how it interacts with other levels (conflicts flagged, not decided), open questions and findings, what to do next, the model-vs-code audit trail, and how many sample addresses it reaches by result. Optional as_of (YYYY-MM-DD) for the status on that date.",
        inputSchema: z.object({
          rule_id: z.string().min(1).max(80).describe("Rule id, e.g. NJ-ALG-56:9-23"),
          as_of: z.string().max(10).optional().describe("Date for the status, YYYY-MM-DD"),
        }),
        annotations: readOnly,
      },
      async (args) => run("get_rule", (d) => getRule(d, args)),
    );

    server.registerTool(
      "get_jurisdiction",
      {
        title: "A city's or state's rules by topic (jurisdiction page)",
        description:
          "Use when the user asks about a city or state in general (no specific building). Returns the jurisdiction page: every rule at this level and above, grouped by the six questions, with its status on the as_of date, what it depends on, citation and a link to the rule; cities below it, sample addresses, contacts and findings. It lists rules; it does not decide which governs a building (get_address does). Optional as_of (YYYY-MM-DD).",
        inputSchema: z.object({
          jurisdiction_id: z.string().min(1).max(40).describe("Jurisdiction id from find_place or coverage, e.g. NJ-NEWARK or CA"),
          as_of: z.string().max(10).optional().describe("Date to answer for, YYYY-MM-DD"),
        }),
        annotations: readOnly,
      },
      async (args) => run("get_jurisdiction", (d) => getJurisdiction(d, args)),
    );

    server.registerTool(
      "get_rules",
      {
        title: "Rules for an address or place (compatibility)",
        description:
          "Kept for compatibility; prefer get_address (an address) or get_jurisdiction (a city or state). Dated, verbatim-quoted rules: pass address_id (results decided per building, unknowns named) or jurisdiction_id (every rule in the State › City stack with status on as_of). Optional as_of (YYYY-MM-DD).",
        inputSchema: z.object({
          address_id: z.string().max(16).optional().describe("Sample address id from find_place, e.g. A0016"),
          jurisdiction_id: z.string().max(40).optional().describe("Jurisdiction id from find_place or coverage, e.g. NJ-HOBOKEN or CA"),
          as_of: z.string().max(10).optional().describe("Date to answer for, YYYY-MM-DD; default the data's as-of date"),
        }),
        annotations: readOnly,
      },
      async (args) => run("get_rules", (d) => getRules(d, args)),
    );

    server.registerTool(
      "coverage",
      {
        title: "What HomeRule covers",
        description: "Use when the user asks what HomeRule covers or where it works: the 3 states and 10 cities, the six topics, example addresses, the data's as-of date, and what is not covered.",
        inputSchema: z.object({}),
        annotations: readOnly,
      },
      async () => run("coverage", (d) => coverage(d)),
    );
  },
  { serverInfo: { name: "homerule", version: "1.1.0" }, instructions: INSTRUCTIONS },
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
