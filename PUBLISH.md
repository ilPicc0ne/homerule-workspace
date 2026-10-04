# Publishing (Sun ~14:00)

This repo (`ilPicc0ne/homerule-workspace`) stays **private**: it holds notes, meetings, ideas and lab work. The submission repo is a filtered copy with only the paths in `.publish-paths`, history included.

    scripts/publish.sh            # builds the filtered copy in /tmp and shows what would be public
    scripts/publish.sh --push     # pushes it to ilPicc0ne/yourhomerule (created private; flip to public by hand)

Before flipping the public repo's visibility:
1. Read the file list and `git log --stat` the script prints.
2. Grep the filtered copy for planning-only words: `notes/`, `wispr`, `Official Use Only`, `villain`, `profile`.
3. Check the README: live link, the three JSON files, how to run, "Not legal advice".

Rules while building: planning and AI drafts go to `notes/`, experiments to `lab/`. The starter pack is tracked in this workspace under `data/realpage-starter/`; the brief stays git-ignored. Neither is included in the public publishing allowlist. `docs/` is for public product docs only (architecture, scoring results, features, decision records in `docs/decisions/`). The private build plan stays in `notes/plan/`.
