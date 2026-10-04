# Supplemental legal sources — first NJ batch

Acquired October 3–4, 2026. **16 catalogued sources: 14 in the main source folders and two excluded publisher editions kept locally. These are extraction inputs, not validated rule records.**

**Read the [completed source-terms review](TERMS-REVIEW.md) before using this batch.** It records current CivicPlus AI-use restrictions, source-specific decisions, and remaining gaps. S015 replaces the core NJ eviction provision; S014 has no complete replacement yet. The original challenge pack is unchanged. No building-data enrichment has been performed yet.

This batch targets gaps around Jersey City, Hoboken, Newark, and NJ state law. Some inputs overlap the starter pack or one another; do not count them as independent rules. The challenge's default as-of date is October 1, 2026: a later retrieval date does not establish what was law on that date.

## Files

- [`manifest.json`](manifest.json): source URLs, kinds, jurisdiction/category hints, related starter IDs, timestamps, SHA-256 hashes, paths, and review requirements. Category hints are routing aids, not extracted conclusions.
- `raw/`: downloaded originals; authoritative for checking layout and amendment markup.
- `text/`: derived UTF-8 text, one file per source.
- `metadata/`: transfer logs and extraction details, including page/part offsets and OCR flags.
- [`acquisition-gaps.json`](acquisition-gaps.json): missing primary sources, incomplete amendment chains, and the next acquisition steps.

All relative paths in JSON resolve from this directory. Source IDs are supplemental `Sxxx` IDs, not replacements for challenge `Dxxx` IDs. S013 is a failed primary-source fetch and has only a transfer log; the numbering gap is intentional.

## Inventory

| ID | Source | Use and limitation |
|---|---|---|
| S001 | Jersey City signed Ordinance 25-057 | Browser download reverified; eligible extraction input with amendments S016/S017. Parse operative dates separately. |
| S002 | NJ DCA security-deposit statute reproduction | **Updated May 2010**; historical input requiring current-law verification. |
| S003 | NJ DCA-hosted landlord/tenant annotated compilation | Excluded locally; S015 replaces the core provision only. |
| S004 | Hoboken older Chapter 155 regulations collection | City-linked scanned collection with different adoption dates; overlaps S012. |
| S005 | Newark 2017 rent-control replacement ordinance | Certified ordinance, OCR text; later amendments still needed. |
| S006 | Newark 2019 appeals amendment | Download link says 2018, but page one identifies August 20, 2019 passage. **Contains struck and inserted text.** |
| S007 | Newark September 18, 2023 moratorium rescission | Change-tracking input; original moratorium and intervening orders still needed. |
| S008 | Hoboken algorithmic-pricing announcement | Official summary; primary legislative record fetch timed out. |
| S009 | Jersey City landlord/tenant guidance | Supporting context and discovery links; overlaps starter D036. |
| S010 | Newark rent-control office guidance | Discovery links for S005–S007, not a complete amendment register. |
| S011 | Hoboken rent-leveling office guidance | Discovery link for S012; guidance is not enacted code. |
| S012 | Hoboken regulations, linked as August 2026 revision | Mixed embedded text/OCR. Regulations collection, not verified complete Chapter 155. Revision filename is not an effective date. |
| S014 | Jersey City complete Chapter 260 DOCX export | Excluded locally because of current publisher AI-use restrictions; no full replacement acquired. |
| S015 | NJ Legislature unannotated § 2A:18-61.1 | Complete core provision captured through research-tool text extraction; raw HTML unavailable. |
| S016 | Jersey City signed Ordinance 25-076 | July amendment to prohibited conduct; preserve strike/underline markup. |
| S017 | Jersey City signed Ordinance 25-098 | September amendment adding sworn rent-setting disclosure; also changes security-guard provision. |

The manifest contains the exact source URL for every entry. S004 was discovered on the [official Hoboken board page](https://www.hobokennj.gov/municipal-boards/rent-leveling-board); S012 through S011; S014 through the municipal guidance and publisher chapter UI. Hosted links may point to Dropbox or a municipal website CDN.

## How to use these safely in extraction

1. Select a source by jurisdiction, category hint, and source kind. Read its review notes and related-source links. Acquisition does not establish current legal validity.
2. Extract candidate rules with citations and supporting spans. Treat guidance, annotations, historical provisions, definitions, and amendment instructions as distinct source roles.
3. Resolve dates and amendment chains before promoting a candidate into the queryable rules dataset. Every manifest entry currently has `automatic_rule_ingestion_allowed: false`; this is an unreviewed acquisition batch.
4. Verify OCR-derived quotes and important numbers against the raw page. A substring match against OCR proves only a match to derived text. The 51 OCR pages have not undergone full visual proofreading.
5. For S006, S016, and S017 in particular, preserve strikethrough/underline semantics from the PDF. Plain text contains deleted words as well as additions. Do not feed it directly into a current-law answer without resolving the amendment.

`metadata/*-extraction.json` maps PDF pages or document parts to end-exclusive Unicode code-point offsets in the corresponding text file. Parts are separated by a newline, form feed, and newline. Offsets belong to this exact text hash; they are not PDF byte offsets or JavaScript UTF-16 indices.

PDF text uses Poppler `pdftotext -layout`. Pages with fewer than 80 non-whitespace characters were OCRed with Tesseract at 220 dpi; confidence is diagnostic, not a correctness guarantee. Even embedded PDF text can contain errors. HTML extraction retains navigation but removes script/style content. DOCX extraction retains paragraph text and footnotes; Chapter 260 labels are literal text, with no `w:numPr` elements in the document body. Formatting and footnote anchors are not reconstructed.

Spot checks included the signed Jersey City adoption page and first pages of Newark's 2017 ordinance, 2019 amendment, 2023 order, and the newer Hoboken collection. This is not a full legal review. No structured rules, legal applicability decisions, or evaluation-score improvement are claimed yet.

## Next priorities

1. Recover Hoboken's actual algorithmic-pricing ordinance; verify NJ FAIR Act primary text and dates against the challenge scenario.
2. Resolve current Hoboken/Newark rent-control text and current NJ deposit/eviction statutes. Municipal enactments were preferred where publisher reuse terms were unresolved.
3. Check post-April 2026 Jersey City amendments and review material OCR spans.
4. Pilot building enrichment on a small Jersey City sample using official rent-control inventory and parcel/assessor records. Keep source date and evidence per fact; missing records do not prove exemptions, and property-level counts need not equal building-level counts.

This folder remains outside the public submission allowlist. Government hosting alone does not grant redistribution rights to third-party annotations or publisher editions. Public redistribution and compatibility of supplemental sources with the grader's accepted citation corpus have not been established.

## Source-terms review — October 3, 2026

See [TERMS-REVIEW.md](TERMS-REVIEW.md) for the completed review and policy links. It supersedes the preliminary audit: the actual Municode UI now links current CivicPlus terms with express AI-use restrictions, rather than the obsolete indexed terms URL used initially.

`terms_review_status`, `terms_review_note`, and `use_for_rule_extraction` record each source decision. Source terms, source currency, and extraction quality are distinct. No source is automatically promoted to a validated rule. The two excluded editions are in Git-ignored `excluded/`, and future readers must respect manifest status rather than glob every text file.

The original download helper did not check robots or source-specific terms before acquisition. This review identified route restrictions and corrected the source selection; it does not retroactively certify all downloads. Nothing was pushed.

## Jersey City signed source bundle — October 4, 2026

S001, S016, and S017 were downloaded from the official public portal and are now eligible for rule extraction. This supersedes S001’s earlier route hold; the historical decision is preserved in the manifest. The PDFs contain signed final-adoption records, not merely first-reading drafts. See [TERMS-REVIEW.md](TERMS-REVIEW.md) for the limited acquisition decision.

Read the three sources together. Keep effective-date resolution, amendment reconciliation, further-currentness review, and evaluation as subsequent steps. The unrelated full Chapter 260, Santa Ana, and Berkeley gaps have not been closed by this acquisition. No pipeline execution or score improvement is claimed.
