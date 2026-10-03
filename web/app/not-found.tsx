import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap narrow empty">
      <h1>Not on this map</h1>
      <p>This page doesn&rsquo;t exist. Search for an address, a city or a state instead.</p>
      <p>
        <Link href="/">Back to the search</Link>
      </p>
    </main>
  );
}
