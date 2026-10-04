# Building evidence review

This UI integration can be reviewed independently of the acquisition work in PR #68.
`planner.py`, `data/building-evidence/public-evidence.json` and
`data/building-evidence/research_routes.json` are copied from that branch at
`76e20be6534de7aa3d87182c62e24bcc14e6f72f`. The planner uses the current engine;
its old generated plans are not reused. When #68 merges, consolidate the planner
into `engine/fact_gaps.py` rather than maintaining two implementations.

From the workspace root, with Python dependencies installed:

```sh
cd web
PYTHON=../.venv/bin/python npm run evidence:build
npm test
npm run dev
```

The default Python executable is `python3`. Generation requires PyYAML and the
repository's engine inputs. It performs no network fetches or legal fact writes.
The ordinary web build does not run Python. It consumes the committed snapshot;
if web sync changes its rules/addresses/results, the runtime withholds stale plans.
After address changes, reacquire the evidence using #68 before regenerating.

Only selected review fields are published in `web/data/building-evidence.json`.
Full source response records and ownership names are not copied into that web
artifact. Source links, record IDs, dates, values and limitations are retained.
The original inputs remain in `data/`, outside the public-export allowlist.

Manual checks:

- `/a/A0107`: open **Show records for this building**. The next question asks for
  original occupancy evidence; assessor year 1978 is only a lead. Expand **Request
  wording**, **Why this question matters**, and follow the topic link.
- `/a/A0366`: MassGIS construction year 1910 differs from current building data
  2024. Both remain visible; no answer or score changes.
- `/a/A0097`: a tax exemption is a proxy, not proof of owner occupancy.
- `/a/A0346`: no evidence panel because the sample has no street number.
- Search for `Fillmore` and press Enter. Stay on the current address until an
  explicit full-address suggestion is selected (mouse or ArrowDown + Enter).
- Typed addresses outside the sample, demo mode and a changed dataset must not
  receive these sample-address leads. Unit-level identity still needs review.

No requests are sent by the panel. Copying request text only writes the clipboard.
