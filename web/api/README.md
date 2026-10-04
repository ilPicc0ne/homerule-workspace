# Live engine for typed addresses

`engine.py` runs the existing stdlib-only Python evaluator. It does not change the
engine, extraction, contracts or scored files. The 500 sample pages continue to
use their precomputed results. The same facts and date produce the same rows.
Typed addresses previously used a TypeScript stand-in without full precedence;
their results can improve even though no building facts have been added.

## Deployment layout

Vercel's Next.js project root remains `web/`. `api/engine.py` is a Python 3.12
function; `app/api/*` remains Next.js. `api/_homerule/` contains exact copies of:

- `engine/{__init__,rules,evaluate,explain,facts,build}.py`
- `out/{rules.compiled,rules,findings}.json`
- `contracts/{jurisdictions,facts}.json`

`npm run sync` updates them; `npm test` fails on drift. Findings are required by
`engine.rules.load()` even though the initial proposal omitted them. Do not edit
copies. Exclusions in `vercel.json` keep Next build files and node_modules out of
the Python function. Dependencies are stdlib-only (`pyproject.toml`, `uv.lock`).

The routing feasibility check used Vercel CLI 62.2.0 with explicitly local-only
project settings, framework `nextjs`, and `vercel build --standalone`. Its output
contained `functions/api/engine.func` with runtime `python3.12` alongside
`api/resolve.func`, `api/mcp.func` and other Next functions. This establishes local
build compatibility, not a successful deployment to Silvan's project. Official
references: [file-based Python functions](https://vercel.com/docs/functions/runtimes/python/api-directory)
and [Python alongside Next.js](https://vercel.com/docs/errors/error-list#unmatched-function-pattern).

## Run locally

From the repository root, in one terminal:

```sh
cd web
npm run sync
python3 api/engine.py --port 5328
```

In another:

```sh
cd web
LIVE_ENGINE_ORIGIN=http://127.0.0.1:5328 npm run dev -- --port 8789
```

`next dev` proxies only `/api/engine` to port 5328. The server page calls the
configured origin directly. On Vercel it uses this deployment's `VERCEL_URL`,
never a request-supplied Host header. If a preview has deployment protection,
`VERCEL_AUTOMATION_BYPASS_SECRET` is sent only to that same deployment; no secret
is exposed to the client. `LIVE_ENGINE_DISABLED=1` forces the existing fallback.

## Verify

- `python3 -m unittest tests.test_live_engine -v`: bundle isolation, 500 exact
  parity comparisons, unknown LA facts, Hoboken conflict parity at two dates,
  malformed inputs, body-size limit, HTTP handler and privacy-safe logging.
- `cd web && npm test`: copy parity, sample mapping parity, response validation,
  three-second deadline behavior and provisional fallback.
- Required repository gate: `make check`. Do not call it green unless the whole
  extraction/rehearsal sequence passed; cache misses can require model access.
- `/a/at?q=1200%203rd%20Ave%2C%20San%20Diego%2C%20CA` is outside the 500 samples.
  Verify all six topic cards, expand Rent increases, use Show the law and source
  links. Building facts stay unknown. The successful live path says "Some answers
  depend on details about your building. We’ll show you what to check."
- Disable the function or set `LIVE_ENGINE_DISABLED=1`, then reload: the same
  page remains usable with its existing provisional banner and results.
- `/a/A0107` still reads the precomputed data; typing that sample redirects there.

Silvan needs to repeat the live/fallback checks on a Vercel preview before merging
or deploying. This Git author's Vercel project access remains blocked, and the
local CLI credential is invalid; local standalone build is not hosted acceptance.

## Boundaries

No parcel lookups, renter-entered fact UI, new facts, model inference or MCP change.
Census's online resolver has no numeric confidence field; typed records use the
existing batch resolver's 0.99 for accepted Census matches. Every building fact
is null and assumptions are empty. The endpoint is public/read-only with a 64 KiB
body cap; it is not a production load-test or an unlimited-throughput claim.
The local 500-request HTTP check is a warm sequential microbenchmark, not a
Vercel cold-start latency measurement.
