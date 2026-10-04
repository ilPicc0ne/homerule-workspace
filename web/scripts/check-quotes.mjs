// Verifies the demo data against the challenge corpus:
//  - every quoted_span (and interaction quote) is a verbatim substring of its source text file;
//  - source_url and retrieved_at match corpus_manifest.csv;
//  - excerpts point at the real offset of their quote;
//  - web/data/jurisdictions.json is identical to contracts/jurisdictions.json.
// Usage: node scripts/check-quotes.mjs   (run from web/; needs the workspace corpus at ../data/realpage-starter)
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const web = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const corpus = path.resolve(web, "../data/realpage-starter/corpus");
const demo = path.join(web, "data/demo");

if (!existsSync(corpus)) {
  console.error(`Corpus not found at ${corpus}. Run inside the workspace with the starter pack.`);
  process.exit(2);
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const manifest = Object.fromEntries(parseCsv(readFileSync(path.join(corpus, "corpus_manifest.csv"), "utf8")).map((r) => [r.doc_id, r]));
const rules = JSON.parse(readFileSync(path.join(demo, "rules.json"), "utf8"));
const meta = JSON.parse(readFileSync(path.join(demo, "meta.json"), "utf8"));
const excerpts = JSON.parse(readFileSync(path.join(demo, "excerpts.json"), "utf8"));
if (meta.simulation?.rule) rules.push(meta.simulation.rule);

const text = (doc) => readFileSync(path.join(corpus, "text", `${doc}.txt`), "utf8");
const failures = [];
let verbatim = 0, pending = 0, extra = 0;

for (const r of rules) {
  const m = r.source_doc_id ? manifest[r.source_doc_id] : null;
  if (r.source_doc_id && !m) failures.push(`${r.rule_id}: source_doc_id ${r.source_doc_id} not in manifest`);
  if (m && r.source_url !== m.url) failures.push(`${r.rule_id}: source_url differs from manifest`);
  if (m && m.retrieved_at && r.retrieved_at !== m.retrieved_at) failures.push(`${r.rule_id}: retrieved_at differs from manifest`);

  if (r.quoted_span === null || r.quoted_span === undefined) {
    pending++;
  } else if (!m || !m.text_file) {
    failures.push(`${r.rule_id}: quote without a corpus text file`);
  } else if (text(r.source_doc_id).includes(r.quoted_span)) {
    verbatim++;
  } else {
    failures.push(`${r.rule_id}: quoted_span is NOT a substring of ${r.source_doc_id}.txt`);
  }

  if (r.interaction?.quote) {
    if (m?.text_file && text(r.source_doc_id).includes(r.interaction.quote)) extra++;
    else failures.push(`${r.rule_id}: interaction quote is NOT a substring of ${r.source_doc_id}.txt`);
  }

  const ex = excerpts[r.rule_id];
  if (r.quoted_span && !ex) failures.push(`${r.rule_id}: no excerpt`);
  if (ex) {
    if (ex.quote !== r.quoted_span) failures.push(`${r.rule_id}: excerpt quote differs from quoted_span`);
    else if (text(ex.doc_id).indexOf(ex.quote) !== ex.offset) failures.push(`${r.rule_id}: excerpt offset wrong`);
  }
}

const copy = readFileSync(path.join(web, "data/jurisdictions.json"), "utf8");
const contract = readFileSync(path.resolve(web, "../contracts/jurisdictions.json"), "utf8");
if (copy !== contract) failures.push("web/data/jurisdictions.json differs from contracts/jurisdictions.json");

console.log(`Rules checked: ${rules.length}`);
console.log(`Quotes verbatim in corpus: ${verbatim}`);
console.log(`Quotes pending extraction (null): ${pending}`);
console.log(`Extra quotes (interaction) verbatim: ${extra}`);
console.log(`Jurisdiction list matches contracts/: ${copy === contract ? "yes" : "no"}`);
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nOK: every quoted_span is a verbatim substring of its source document.");
