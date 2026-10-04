# Official-source monitor (issue #60)

Detect newly published and revised documents, pin their bytes, queue extraction, and show candidate address impacts. The accepted rule files, scored outputs and alert recipients are never changed by a monitor run. Every output carries an as-of date and “not legal advice”.

## Run

Python 3.10+; the existing extraction/eval dependency is PyYAML. PDF sources additionally need `pdftotext` (Poppler).

```sh
make monitor                       # one bounded live poll, no model calls
make monitor EXTRACT=1              # also process at most two queued versions
make monitor-watch EXTRACT=1        # foreground worker; Ctrl-C stops it
make monitor-report                # localhost:8766; serves only the report, not the state DB
make monitor-replay                 # fictional source replay, no network or model calls
make monitor-replay EXTRACT=1       # real extraction + address engine on the fictional replay
make test-monitor
```

`python -m monitor` accepts `--config`, `--state`, `--as-of`, `--max-jobs` and manual `--force`. A replay requires a new state directory (use `--state build/replay-2`). A live `watch` checks scheduling every 60 seconds; Newark polls every six hours. No system scheduler is installed and no daemon is started by installation. With `--extract`, existing OpenRouter credentials or exact model-call cache entries are required. A failure stays queued with exponential retry backoff and fair scheduling; disabled sources do not block eligible jobs. It is not replaced with invented results. A foreground watch can retry on later cycles.

## Boundaries and source approval

The shipped adapter uses the [documented Legistar API](https://webapi.legistar.com/Help) for Newark: a bounded modified-matter index, then metadata, text-version lists and plain text. It discovers ordinance titles matching housing-related terms and also revisits six known rent-control matters. Title filtering is a discovery heuristic, **not complete legal coverage**. All new matches enter the queue; nothing is silently labelled enacted from a changed web page. The index watermark advances only when pagination finishes. If its page cap is reached, the report says coverage is incomplete, saves a timestamp/ID cursor, and resumes that bounded discovery window on the next run. It never claims complete coverage while a backlog remains.

`monitor/sources.json` records jurisdiction, exact allowed HTTPS host/path routes, interval, source-specific limits and a dated access-review note. Live monitoring refuses disabled, held or unreviewed sources; review expires after 30 days. This does not inherit permission merely from `use_for_rule_extraction` in the supplemental manifest. The existing CivicPlus holds and CivicWeb crawler restriction remain in force. No authentication, challenge bypass or user-agent impersonation is used.

The HTTP client checks robots on each host each cycle, honors delays and Retry-After, refuses non-public destinations and off-route redirects, limits requests/time/body sizes, and stores ETag/Last-Modified validators. 404 robots means no published robots directives, not a reuse license. 403, 404 source documents, invalid JSON, missing text and OCR/encoding gaps stay visible; old evidence is preserved. A 304 reuses the exact pinned response. Redirects must remain within reviewed routes. Review the route and terms before adding a source.

A second `document` adapter supports an explicit URL list and an optional one-level HTML index (`index_url`, `link_pattern`). It follows only matching URLs inside the source's scopes. Text, HTML and embedded-text PDFs are supported. Scripts, navigation and footers are excluded from HTML fingerprints. Scanned PDFs, malformed encoding and very short responses are held; OCR is not silently invented. The generic parser cannot prove that an arbitrary error page is legal text, so use a stable official route and inspect its first snapshot.

## State, extraction and legal effect

`build/source-monitor/` contains a SQLite state database, immutable raw responses, document snapshots, queued events, extraction artifacts and `report.html`/`report.json`. A process lock excludes simultaneous writers. Snapshot and queue updates are transactional. Repeated unchanged fetches do not enqueue work; reverting to a previous text version does. Failed requests never advance “last successful pass”. Partial passes say so. New discoveries and known documents rotate through a bounded work budget.

With `--extract`, a subprocess runs the existing Jev/Luna extraction and gate on each changed **whole document**, preserving context. It uses isolated index/extraction/version paths and the usual model cache, then compiles in memory through the existing rule adapter. It checks document/extraction failures and verbatim support before estimating impact. Partial/empty extraction yields review reasons, not an assertion that a law was repealed. Cached monitor extraction is tied to source and extractor code. Raw pages are untrusted input; the extractor has no crawler tools or control over the allowlist.

Candidate before/after sets run through `engine.build.build_lookups` over all sample addresses, so newly covered and no-longer-covered buildings are both considered. The monitor compares rule content as well as applicability; an amount or supporting quote can change while the result stays “applies”. It evaluates today and exact future effective/end dates found in those rules. Existing accepted rules are also reevaluated when the date changes, even if every fetch fails or is not due. A changed accepted dataset resets that date-only baseline explicitly.

**All impacts are previews requiring review.** A newly found amendment may depend on other enactments; comparing its standalone extraction is not a verified consolidation of the law. Known matters have explicit baseline source-unit mappings. Unique exact jurisdiction/category/citation matches retain accepted identities so a namespace change does not create false impact. If a historical source loses a known end date, or extraction omits any previously known provision, impact is withheld pending reconciliation. An omission is never taken as proof of repeal. Discovery date, publisher modification date and legal effective date remain separate. No monitor run promotes candidates, removes accepted laws, sends emails, or overwrites `out/changes.full.json`. Review and promotion into the existing corpus/build pipeline remains a deliberate separate step.

## Demo

`replay` supplies two labelled fictional versions of the existing Cambridge X001 fixture through an offline source transport. It changes a building-count threshold in the document, not an expected rule or test answer. Without `--extract`, it demonstrates snapshots and queueing only. With `--extract`, both versions pass through real model extraction and the existing address evaluator; the report shows actual results or errors. It is never presented as a live municipal publication.
