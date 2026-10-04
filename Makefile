# HomeRule pipeline. Targets fail loudly until implemented; see docs/ARCHITECTURE.md.
AS_OF ?= 2026-10-01

.PHONY: all extract resolve resolve-live build eval freeze ingest rehearse rerun web

all: extract resolve build eval          ## rebuild everything from the corpus

extract:                                 ## A · corpus -> out/rules.json, out/rules.compiled.json, out/findings.json (Dimitar)
	python3 -m extract.corpus
	python3 -m extract.luna_pass $$(ls out/index | grep "^[DS]" | sed "s/.json//")
	python3 -m extract.gate
	python3 -m extract.links
	python3 -m extract.open_questions
	python3 -m extract.compile

resolve:                                 ## B · sample addresses -> out/addresses.resolved.json, offline from engine/cache/census (Silvan)
	cd web && npm run resolve

resolve-live:                            ## B · same, calling Census for requests missing from the cache
	cd web && npm run sync && node scripts/resolve-batch.ts --live && npm run sync

build:                                   ## C+D · engine -> outputs/lookups.json, outputs/changes.json (Silvan)
	@echo "build: not implemented yet (engine/), AS_OF=$(AS_OF)"; exit 1

eval:                                    ## assertion suite, T1-T6, trap addresses, quote check, disclaimer crawl
	python3 -m tests.eval_suite --supplemental

check:                                   ## full suite after any change to extract/, engine/ or tests/: re-extract (cached), eval, engine parity, hour-16 rehearsal
	$(MAKE) extract
	python3 -m tests.eval_suite --supplemental | tail -0
	python3 -m tests.parity
	$(MAKE) rehearse
	@grep -E "^\*\*|^## (Assert|questions)|^\| T[1-6] \| [0-9]+ \|" out/eval/report_supplemental.md

freeze:                                  ## before the hour-16 drop: lock the prompt digest (extract/PROMPTS.lock); make eval checks it
	python3 -m extract.prompts --freeze

ingest:                                  ## hour-16: make ingest DOC=<path> JUR="Cambridge, MA" [ID=X002]
	python3 -m extract.ingest $(DOC) --jurisdiction "$(JUR)" --id $(or $(ID),X002)
	python3 -m tests.eval_suite --supplemental

rehearse:                                ## hour-16 dry run on the fictional tests/fixtures/synthetic/X001.txt; removed afterwards
	python3 -m extract.ingest tests/fixtures/synthetic/X001.txt --jurisdiction "Cambridge, MA" --id X001
	python3 -m tests.eval_suite --supplemental
	rm -f out/index/X001.json out/extracted/X001.json
	python3 -m extract.compile
	python3 -m tests.eval_suite --supplemental > /dev/null

rerun:                                   ## live re-extraction of one doc, fresh model calls: make rerun DOC=D0xx
	EXTRACT_RUN=live-$$(date +%s) python3 -m extract.luna_pass $(DOC)
	python3 -m extract.gate $$(ls out/extracted | sed 's/.json//' | grep -w $(DOC))
	python3 -m extract.compile
	python3 -m tests.eval_suite --supplemental

web:                                     ## local dev server
	cd web && npm run dev
