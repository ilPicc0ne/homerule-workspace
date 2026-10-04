/*
  One switch for where the data comes from:
    NEXT_PUBLIC_DATA_SOURCE=live (default) → web/data/live/ (engine output, built by npm run sync)
    NEXT_PUBLIC_DATA_SOURCE=demo           → web/data/demo/ (hand-prepared, kept for comparison)
  Read on both server and client, so the header toggle always shows the active source.
*/
export type DataSource = "demo" | "live";

export const DATA_SOURCE: DataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === "demo" ? "demo" : "live";

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  demo: "Demo data",
  live: "Live",
};
