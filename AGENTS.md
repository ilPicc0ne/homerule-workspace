# Working on HomeRule (for people and coding agents)

**Read first:** [docs/PRD.md](docs/PRD.md) (what, priorities, owners, status) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (how, interfaces). The PRD is the master; when code and PRD disagree, raise it, don't silently diverge.

## Workflow

1. Pick an open GitHub issue assigned to you (`gh issue list --assignee @me`). One issue = one PRD feature row.
2. Branch from `main`: `d/<topic>` (Dimitar) or `s/<topic>` (Silvan), e.g. `d/extract-classify`, `s/address-lookup`.
3. Small commits; open a PR early. The PR description says `Closes #<issue>`.
4. In the same PR, update the feature's **Status** in the PRD table (planned → WIP → partial → built).
5. Merge yourself once `make eval` is green. Ask the other person to review only PRs that touch `contracts/` or change the scored files' shape.
6. Interfaces in `contracts/` (I1–I6 in ARCHITECTURE) change only via PR with the other person tagged.

## Rules that protect the score

- Jurisdiction IDs only from `contracts/jurisdictions.json`; `rules.json` writes its `schema_name`.
- Never hand-code rules or edit `outputs/*.json` by hand. Outputs are committed only from a build on `main`.
- No prompt edits after the hour-16 drop (prompt hash is checked).
- No citation, date or key value from the test suite inside a prompt.
- "Not legal advice" and the as-of date on every view, email and API payload. Never "compliant" or "illegal".

## Secrets and private material

- Keys live in `.env.local` (git-ignored) and in Vercel, never in the repo.
- `notes/`, `lab/` and `data/brief/` are private workspace material; the public repo is a filtered export (`.publish-paths`, `PUBLISH.md`).
