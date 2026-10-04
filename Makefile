# HomeRule pipeline. Targets fail loudly until implemented; see docs/ARCHITECTURE.md.
AS_OF ?= 2026-10-01
PY ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)

.PHONY: all extract resolve resolve-live build test eval freeze ingest rehearse rerun web

all: extract resolve build eval          ## rebuild everything from the corpus

extract:                                 ## A · corpus -> out/rules.json, out/rules.compiled.json, out/findings.json (Dimitar)
	$(PY) -m extract.corpus
	$(PY) -m extract.luna_pass $$(ls out/index | grep "^[DS]" | sed "s/.json//")
	$(PY) -m extract.gate
	$(PY) -m extract.links
	$(PY) -m extract.open_questions
	$(PY) -m extract.compile

resolve:                                 ## B · sample addresses -> out/addresses.resolved.json, offline from engine/cache/census (Silvan)
	cd web && npm run resolve

resolve-live:                            ## B · same, calling Census for requests missing from the cache
	cd web && npm run sync && node scripts/resolve-batch.ts --live && npm run sync

build:                                   ## C+D · engine -> outputs/lookups.json, outputs/changes.json, out/lookups.full.json (Silvan)
	$(PY) -m engine.build --as-of $(AS_OF)

test:                                    ## engine unit tests, guards and the PRD journeys (python -m unittest)
	$(PY) -m unittest discover -s tests -p "test_*.py" -t .

eval:                                    ## assertion suite, T1-T6, trap addresses, quote check, disclaimer crawl
	$(PY) -m tests.eval_suite --supplemental

freeze:                                  ## before the hour-16 drop: lock the prompt digest (extract/PROMPTS.lock); make eval checks it
	$(PY) -m extract.prompts --freeze

ingest:                                  ## hour-16: make ingest DOC=<path> JUR="Cambridge, MA" [ID=X002]
	$(PY) -m extract.ingest $(DOC) --jurisdiction "$(JUR)" --id $(or $(ID),X002)
	$(PY) -m tests.eval_suite --supplemental

rehearse:                                ## hour-16 dry run on the fictional tests/fixtures/synthetic/X001.txt; removed afterwards
	$(PY) -m extract.ingest tests/fixtures/synthetic/X001.txt --jurisdiction "Cambridge, MA" --id X001
	$(PY) -m tests.eval_suite --supplemental
	rm -f out/index/X001.json out/extracted/X001.json
	$(PY) -m extract.compile
	$(PY) -m tests.eval_suite --supplemental > /dev/null

rerun:                                   ## live re-extraction of one doc, fresh model calls: make rerun DOC=D0xx
	EXTRACT_RUN=live-$$(date +%s) $(PY) -m extract.luna_pass $(DOC)
	$(PY) -m extract.gate $$(ls out/extracted | sed 's/.json//' | grep -w $(DOC))
	$(PY) -m extract.compile
	$(PY) -m tests.eval_suite --supplemental

web:                                     ## local dev server
	cd web && npm run dev
