import { DATA_SOURCE } from "@/lib/config";

/* "Demo data" tag next to headings; nothing when the build serves live engine results. */
export default function SourceTag() {
  return DATA_SOURCE === "demo" ? <span className="tag tag-demo">Demo data</span> : null;
}
