import Link from "next/link";

export default function LiveUnavailable() {
  return (
    <main className="wrap narrow empty">
      <h1>Live data isn&rsquo;t available yet</h1>
      <p>It arrives with the rule engine. Until then this build has nothing to show.</p>
      <p>
        <Link href="/">Back to the start</Link>
      </p>
    </main>
  );
}
