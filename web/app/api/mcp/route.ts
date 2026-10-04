// Public MCP server (Streamable HTTP, stateless, no Redis session store): https://yourhomerule.com/api/mcp
// Three read-only tools over the existing data and resolver (lib/mcp/tools.ts). docs/ARCHITECTURE.md → MCP.
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { clientIp } from "@/lib/alerts/server";
import { storeFromEnv } from "@/lib/alerts/store.ts";
import { getDataset } from "@/lib/data";
import { coverage, findPlace, getRules, INSTRUCTIONS, MAX_QUERY, type ToolAnswer, type ToolDeps } from "@/lib/mcp/tools.ts";
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
          "Resolve a US address, city, neighbourhood, county, state or ZIP to its legal jurisdictions (State › County › City). Says whether HomeRule covers it, the legal city when it differs from the postal city, and the sample address_id if it is one of HomeRule's 500 sample addresses. Use first; then call get_rules.",
        inputSchema: z.object({ query: z.string().min(1).max(MAX_QUERY).describe("Address or place, e.g. '471 Columbia Rd, Dorchester, MA' or 'Hoboken, NJ'") }),
        annotations: { ...readOnly, openWorldHint: true },
      },
      async ({ query }) => run("find_place", (d) => findPlace(d, query)),
    );

    server.registerTool(
      "get_rules",
      {
        title: "Get the renter-protection rules",
        description:
          "Dated, verbatim-quoted renter-protection rules (rent increases, eviction, deposits, application fees, screening, rent-setting software). Pass address_id (a HomeRule sample address: results decided per building, unknowns named) or jurisdiction_id (any state or covered city: every rule in the State › City stack with status on the as_of date, citation, quote, source URL and coverage conditions). Optional as_of (YYYY-MM-DD).",
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
        description: "The 3 states and 10 cities HomeRule covers, the six topics, the data's as-of date, and what is not covered.",
        inputSchema: z.object({}),
        annotations: readOnly,
      },
      async () => run("coverage", (d) => coverage(d)),
    );
  },
  { serverInfo: { name: "homerule", version: "1.0.0" }, instructions: INSTRUCTIONS },
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
