# Hour 16: the new ordinance, step by step

> The organizers removed the hour-16 ordinance (v5 participant release, confirmed 04.10.): the change tests are T1–T5. These steps still work for any new document, e.g. the fictional X001 in `make rehearse`.

Rehearsed by `make rehearse` (fictional X001, Cambridge: 45 addresses). A real document makes live model calls
(three Luna samples in parallel plus checks): minutes, not seconds.

1. **Save the text** as `data/hour16/<short-name>.txt`. First two lines (then a blank line, then the law text):
   ```
   SOURCE: <official URL>
   RETRIEVED: <YYYY-MM-DD HH:MM UTC>
   ```
   PDF: `pdftotext -layout file.pdf -` and paste the text below the header.
2. **Ingest** (jurisdiction = one of: CA, NJ, MA, Los Angeles, CA, San Francisco, CA, San Diego, CA, Berkeley, CA,
   Santa Ana, CA, Jersey City, NJ, Hoboken, NJ, Newark, NJ, Boston, MA, Cambridge, MA):
   ```
   make ingest DOC=data/hour16/<short-name>.txt JUR="<City, ST>" ID=X002
   ```
   Prints each new rule (category, citation, requirement, key value) and its effective date, then the eval
   report: T6 = addresses whose results differ with vs without the document, at its effective date.
3. **Check the rule**: quote, citation, effective date and status make sense against the text; then one address:
   ```
   python3 -m tests.hour16_question X002 [A0xxx]
   ```
4. **Full suite**: `make check` (re-uses the cached calls of step 2; prompts must still match the lock).
5. **Scored files**: on main, `make build`, then commit `out/rules.json`, `outputs/` (copy `out/rules.json` to
   `outputs/rules.json`), `out/lookups.full.json`, `out/changes.full.json`, `out/build_summary.json` and the source
   text in `data/hour16/` together, in one PR.
6. **Hand over to Silvan**: the doc id, the rule id(s), the T6 count; he runs the alert (`make alert ...`).

If extraction misses or misreads the rule: `make rerun DOC=X002` repeats it with fresh model calls. Never edit a
rule record or a prompt by hand.
