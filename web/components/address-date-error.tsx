import Link from "next/link";
import AddressDateControl from "./address-date-control";
import type { DateControls } from "@/lib/address-dates";

export default function AddressDateError({ config, message }: { config: DateControls; message: string }) {
  return <main className="v3"><div className="wrap" style={{ paddingTop: 40 }}>
    <Link href="/">HomeRule</Link>
    <h1>Answers unavailable for this date</h1>
    <p role="alert">{message}</p>
    <p>No answers from a different date are shown. Not legal advice.</p>
    <AddressDateControl config={config} unavailable />
  </div></main>;
}
