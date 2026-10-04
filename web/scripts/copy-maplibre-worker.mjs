// Serves MapLibre's web worker from /maplibre/ (bundlers can't resolve its import.meta.url worker).
// Runs before dev and build, so the files always match the pinned maplibre-gl version.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const from = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist");
const to = path.join(process.cwd(), "public", "maplibre");
mkdirSync(to, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(path.join(from, f), path.join(to, f));
