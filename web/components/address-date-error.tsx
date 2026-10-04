"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { DateControls } from "@/lib/address-dates";
import { formatDate } from "@/lib/format";

export default function AddressDateError({ config, message }: { config: DateControls; message: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = new URLSearchParams(useSearchParams().toString());
  params.set("as_of", config.baseline);
  const [pending, startTransition] = useTransition();
  return <main className="v3"><div className="wrap" style={{ paddingTop: 40 }}>
    <Link href="/">HomeRule</Link>
    <h1>Answers unavailable for this date</h1>
    <p role="alert">{message}</p>
    <p>Requested date: {formatDate(config.selected)}. No answers from a different date are shown. Not legal advice.</p>
    <div className="timeline-recovery">
      <button className="timeline-date" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Retrying…" : "Try again"}</button>
      <Link className="timeline-date" href={`${path}?${params}`}>Back to dataset date · {formatDate(config.baseline)}</Link>
    </div>
  </div></main>;
}
