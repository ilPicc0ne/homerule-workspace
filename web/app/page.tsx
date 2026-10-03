export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Not legal advice. HomeRule shows which published housing rules may apply to an address, with quotes and dates.
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">HomeRule</h1>
      <p className="text-xl text-zinc-700">Your rights as a renter, for your exact address.</p>
      <p className="text-zinc-600">
        Coming soon: enter an address in California, New Jersey or Massachusetts and see which housing rules apply
        there today and what is about to change, quoted from the law itself. Scope: 3 states, 10 cities, 500 sample
        addresses.
      </p>
      <p className="text-sm text-zinc-500">Built at Hack-Nation 7 for the RealPage challenge “Rental Housing Law Navigator”.</p>
    </main>
  );
}
