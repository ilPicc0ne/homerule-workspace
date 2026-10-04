# Demo data

Hand-prepared from the challenge brief and the PRD, in the shapes the engine will produce
(`lib/types.ts`). Results are set by hand, not computed. Quotes are copied verbatim from the
challenge corpus; `npm run check:quotes` verifies every `quoted_span` against
`data/realpage-starter/corpus/text/` and the manifest. Rules without corpus text carry
`quoted_span: null` and show "Quote pending extraction".

`addresses.json` covers all 500 sample addresses: jurisdiction from the postal city and the
alias list in `../jurisdictions.json` (a copy of `contracts/jurisdictions.json`), coordinates
from the Census geocoder run in the workspace lab (withheld where Census matched a different city).
