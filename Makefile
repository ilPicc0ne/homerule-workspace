# HomeRule pipeline. Targets fail loudly until implemented; see docs/ARCHITECTURE.md.
AS_OF ?= 2026-10-01
PY ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)

.PHONY: notify alert all extract resolve resolve-live build score test eval check freeze ingest rehearse demo-change rerun web

all: extract resolve build eval          ## rebuild everything from the corpus

SAMPLES ?= s0 s1 s2

extract:                                 ## A · corpus -> out/rules.json, out/rules.compiled.json, out/findings.json (Dimitar); $(SAMPLES) extracted in parallel, majority vote
	$(PY) -m extract.corpus
	@for s in $(SAMPLES); do \
	  run=$$( [ $$s = s0 ] || echo $$s ); \
	  ( EXTRACT_DIR=$$s EXTRACT_RUN=$$run $(PY) -m extract.luna_pass $$(ls out/index | grep "^[DSX]" | sed "s/.json//") > out/extracted_$$s.log 2>&1 \
	    && EXTRACT_DIR=$$s EXTRACT_RUN=$$run $(PY) -m extract.gate >> out/extracted_$$s.log 2>&1 \
	    || echo "sample $$s failed: see out/extracted_$$s.log" ) & \
	done; wait
	$(PY) -m extract.vote $(SAMPLES)
	$(PY) -m extract.links
	$(PY) -m extract.open_questions
	$(PY) -m extract.compile

resolve:                                 ## B · sample addresses -> out/addresses.resolved.json, offline from engine/cache/census (Silvan)
	cd web && npm run resolve

resolve-live:                            ## B · same, calling Census for requests missing from the cache
	cd web && npm run sync && node scripts/resolve-batch.ts --live && npm run sync

build:                                   ## C+D · engine -> outputs/lookups.json, outputs/changes.json, out/lookups.full.json, out/changes.full.json (Silvan)
	$(PY) -m engine.build --as-of $(AS_OF)

score:                                   ## renter-protection score per address, city and state, per date, and change verdicts -> out/scores.json (contracts/impact.json)
	$(PY) -m engine.score

test:                                    ## engine unit tests, guards and the PRD journeys (python -m unittest)
	$(PY) -m unittest discover -s tests -p "test_*.py" -t .

eval:                                    ## assertion suite, T1-T6, trap addresses, quote check, disclaimer crawl
	$(PY) -m tests.eval_suite --supplemental

check:                                   ## full suite after any change to extract/, engine/ or tests/: re-extract (samples + vote, cached), build, engine tests, eval, parity, hour-16 rehearsal
	$(MAKE) extract
	$(MAKE) build
	$(MAKE) score
	$(MAKE) test
	$(PY) -m tests.eval_suite --supplemental > /dev/null
	$(PY) -m tests.parity
	$(MAKE) rehearse
	@grep -E "^\*\*|^## (Assert|questions)|^\| T[1-6] \| [0-9]+ \|" out/eval/report_supplemental.md

freeze:                                  ## before the hour-16 drop: lock the prompt digest (extract/PROMPTS.lock); make eval checks it
	$(PY) -m extract.prompts --freeze

ingest:                                  ## hour-16: make ingest DOC=<path> JUR="Cambridge, MA" [ID=X002]
	$(PY) -m extract.ingest $(DOC) --jurisdiction "$(JUR)" --id $(or $(ID),X002)
	$(PY) -m tests.eval_suite --supplemental

rehearse:                                ## hour-16 dry run on the fictional tests/fixtures/synthetic/X001.txt (incl. the question an address would ask); removed afterwards
	$(PY) -m extract.ingest tests/fixtures/synthetic/X001.txt --jurisdiction "Cambridge, MA" --id X001
	$(PY) -m tests.eval_suite --supplemental
	$(PY) -m tests.hour16_question X001
	rm -f out/index/X001.json out/extracted*/X001.json
	$(PY) -m extract.compile
	$(PY) -m tests.eval_suite --supplemental > /dev/null

DEMO_JUR = $(if $(JUR),$(JUR),Cambridge$(COMMA) MA)
COMMA := ,
demo-change:                             ## demo only: ingest -> before/after -> diff -> out/changes.full.json -> web sync; default the fictional X001
	$(PY) -m engine.demo_change $(or $(DOC),tests/fixtures/synthetic/X001.txt) --jurisdiction "$(DEMO_JUR)" --id $(or $(ID),X001) --as-of $(AS_OF)
	cd web && npm run sync

rerun:                                   ## live re-extraction of one doc, fresh model calls: make rerun DOC=D0xx
	EXTRACT_RUN=live-$$(date +%s) $(PY) -m extract.luna_pass $(DOC)
	$(PY) -m extract.gate $$(ls out/extracted | sed 's/.json//' | grep -w $(DOC))
	$(PY) -m extract.compile
	$(PY) -m tests.eval_suite --supplemental

web:                                     ## local dev server
	cd web && npm run dev

notify:                                  ## change alerts, local: dry run lists who would get which email; SEND=1 SOURCE=<id> sends one source (allowed subscribers only during the closed test; no DEMO_TOKEN needed)
	cd web && node --env-file-if-exists=.env.local scripts/alerts.ts notify --changes $(or $(CHANGES),../out/changes.full.json) $(if $(SOURCE),--source $(SOURCE)) $(if $(SEND),--send)

alert:                                   ## demo hook, the last step once the production deploy is Ready: make alert SOURCE=<id> [RESET=1] [URL=https://yourhomerule.com]
	$(if $(SOURCE),,$(error SOURCE=<change source id> is required))
	$(if $(RESET),cd web && node --env-file-if-exists=.env.local scripts/alerts.ts reset "$(SOURCE)")
	cd web && node --env-file-if-exists=.env.local scripts/alerts.ts trigger "$(SOURCE)" $(if $(URL),--url $(URL))

.PHONY: monitor monitor-watch monitor-report monitor-replay test-monitor
monitor:                                ## one bounded official-source poll; EXTRACT=1 also queues real model processing
	$(PY) -m monitor poll $(if $(filter 1,$(EXTRACT)),--extract)

monitor-watch:                          ## foreground worker; six-hour source interval, daily effective-date checks
	$(PY) -m monitor watch $(if $(filter 1,$(EXTRACT)),--extract)

monitor-report:                         ## local monitor dashboard (only report files served)
	$(PY) -m monitor serve

monitor-replay:                         ## labelled fictional replay; EXTRACT=1 uses actual models and engine
	$(PY) -m monitor replay --state build/monitor-replay $(if $(filter 1,$(EXTRACT)),--extract)

test-monitor:
	$(PY) -m unittest discover -s tests -p "test_monitor*.py" -t .
