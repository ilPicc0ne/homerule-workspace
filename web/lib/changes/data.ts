// The per-address diff as built (web/data/changes.full.json is a synced copy of out/changes.full.json).
import data from "../../data/changes.full.json" with { type: "json" };
import type { ChangesFile } from "./types.ts";

export const changes = data as unknown as ChangesFile;
