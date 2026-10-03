/*
  One switch for where the data comes from:
    NEXT_PUBLIC_DATA_SOURCE=demo (default) → web/data/demo/
    NEXT_PUBLIC_DATA_SOURCE=live           → web/data/live/ (engine output; empty until the engine lands)
  Read on both server and client, so the header toggle always shows the active source.
*/
export type DataSource = "demo" | "live";

export const DATA_SOURCE: DataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === "live" ? "live" : "demo";

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  demo: "Demo data",
  live: "Live",
};
