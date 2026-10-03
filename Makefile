# HomeRule pipeline. Targets fail loudly until implemented; see docs/ARCHITECTURE.md.
AS_OF ?= 2026-10-01

.PHONY: all extract resolve build eval ingest rerun web

all: extract resolve build eval          ## rebuild everything from the corpus

extract:                                 ## A · corpus -> out/rules.json, out/rules.compiled.json, out/findings.json (Dimitar)
	python3 -m extract.corpus
	python3 -m extract.luna_pass $$(ls out/index | grep '^D' | sed 's/.json//')
	python3 -m extract.gate
	python3 -m extract.links
	python3 -m extract.compile

resolve:                                 ## B · sample addresses -> out/addresses.resolved.json (Silvan)
	@echo "resolve: not implemented yet (engine/)"; exit 1

build:                                   ## C+D · engine -> outputs/lookups.json, outputs/changes.json (Silvan)
	@echo "build: not implemented yet (engine/), AS_OF=$(AS_OF)"; exit 1

eval:                                    ## assertion suite, T1-T6, trap addresses, quote check, disclaimer crawl
	python3 -m tests.eval_suite

ingest:                                  ## hour-16: make ingest DOC=<path> JUR="Cambridge, MA" [ID=X002]
	python3 -m extract.ingest $(DOC) --jurisdiction "$(JUR)" --id $(or $(ID),X002)
	python3 -m tests.eval_suite

rerun:                                   ## live re-extraction of one doc: make rerun DOC=D0xx
	@echo "rerun: not implemented yet, DOC=$(DOC)"; exit 1

web:                                     ## local dev server
	cd web && npm run dev
