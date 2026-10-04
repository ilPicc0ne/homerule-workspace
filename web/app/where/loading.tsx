// Shown while Census answers (usually 1–3 s).
export default function Loading() {
  return (
    <main className="wrap" style={{ maxWidth: "40rem", paddingBlock: "3rem" }}>
      <p role="status" style={{ color: "var(--muted)" }}>
        Looking up the address with the US Census…
      </p>
    </main>
  );
}
