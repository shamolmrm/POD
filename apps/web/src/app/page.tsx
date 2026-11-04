import { SiteFooter, SiteHeader } from "@/components/site-header";

const STEPS = [
  { title: "Pick a product", text: "T-shirts, hoodies, mugs, posters and more." },
  { title: "Design it", text: "Upload images, add text and see a live preview." },
  { title: "We print & ship", text: "Printed on demand and delivered worldwide." },
];

function Shirt() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path
        d="M70 30 L45 40 L20 70 L42 88 L55 75 L55 175 L145 175 L145 75 L158 88 L180 70 L155 40 L130 30 Q100 52 70 30 Z"
        fill="var(--bg)"
        stroke="var(--fg)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="75" y="80" width="50" height="60" rx="6" fill="none" stroke="var(--muted)" strokeDasharray="4 4" />
      <circle cx="100" cy="105" r="17" fill="url(#g)" />
      <path d="M84 128 h32" stroke="var(--fg)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
    <SiteHeader />
    <main className="mx-auto flex max-w-5xl flex-col px-4 py-8 sm:px-6">

      <section className="grid flex-1 items-center gap-10 py-12 md:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full border border-line px-3 py-1 text-xs font-medium text-muted">
            Coming soon
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Design it.{" "}
            <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">We print it.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted">
            Create your own custom products in an easy online editor. Printed on demand and shipped worldwide.
          </p>
        </div>
        <div className="mx-auto aspect-square w-full max-w-sm">
          <Shirt />
        </div>
      </section>

      <ol className="grid gap-4 pb-8 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-line p-5">
            <span className="text-sm font-semibold text-accent">0{i + 1}</span>
            <h2 className="mt-1 font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">{s.text}</p>
          </li>
        ))}
      </ol>

    </main>
    <SiteFooter />
    </>
  );
}
