# Live data (engine output)

Empty until the rule engine lands. Put the engine's files here in the same shapes as `../demo/`
(`meta.json`, `rules.json`, `lookups.json`, `addresses.json`, `excerpts.json`; types in `lib/types.ts`)
and build with `NEXT_PUBLIC_DATA_SOURCE=live`. Without these files the site shows
"Live data isn't available yet" and the address API answers 503.
