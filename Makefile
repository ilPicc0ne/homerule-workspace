# HomeRule pipeline. Targets fail loudly until implemented; see docs/ARCHITECTURE.md.
AS_OF ?= 2026-10-01

.PHONY: all extract resolve resolve-live build eval ingest rerun web

all: extract resolve build eval          ## rebuild everything from the corpus

extract:                                 ## A · corpus -> out/rules.json, out/rules.compiled.json (Dimitar)
	@echo "extract: not implemented yet (extract/)"; exit 1

resolve:                                 ## B · sample addresses -> out/addresses.resolved.json, offline from engine/cache/census (Silvan)
	cd web && npm run resolve

resolve-live:                            ## B · same, calling Census for requests missing from the cache
	cd web && npm run sync && node scripts/resolve-batch.ts --live && npm run sync

build:                                   ## C+D · engine -> outputs/lookups.json, outputs/changes.json (Silvan)
	@echo "build: not implemented yet (engine/), AS_OF=$(AS_OF)"; exit 1

eval:                                    ## assertion suite, T1-T6, trap addresses, quote check, disclaimer crawl
	@echo "eval: not implemented yet (tests/)"; exit 1

ingest:                                  ## hour-16: make ingest DOC=<path> [TEST=<t6.json>]
	@echo "ingest: not implemented yet, DOC=$(DOC)"; exit 1

rerun:                                   ## live re-extraction of one doc: make rerun DOC=D0xx
	@echo "rerun: not implemented yet, DOC=$(DOC)"; exit 1

web:                                     ## local dev server
	cd web && npm run dev
