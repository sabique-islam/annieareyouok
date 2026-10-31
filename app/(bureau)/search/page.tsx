import Link from "next/link";
import { searchCorpus } from "@/lib/search/search";

export const metadata = { title: "Search" };

const PROMPTS = [
  "hidden corrosion inside the cabin",
  "transmission slips when the engine is cold",
  "damp footwell",
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const result = q.trim().length >= 2 ? await searchCorpus(q) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1>Search</h1>
      </div>
      <form className="sheet flex flex-wrap gap-3 p-4" action="/search">
        <label className="field min-w-[16rem] flex-1">
          <span>Query</span>
          <input name="q" defaultValue={q} placeholder="Fault or keywords" />
        </label>
        <div className="self-end">
          <button className="primary" type="submit">Search</button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((prompt) => (
          <Link key={prompt} className="button" href={`/search?q=${encodeURIComponent(prompt)}`}>
            {prompt}
          </Link>
        ))}
      </div>
      {result ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <ResultCard title="Similar">
            {result.vector.map((hit) => (
              <article key={hit.inspection_id} className="border-t border-line py-3">
                <Link className="font-semibold" href={`/inspections/${hit.inspection_id}`}>
                  {hit.model_year} {hit.make} {hit.model}
                </Link>
                <p className="text-sm text-muted">{Math.round(Number(hit.similarity) * 100)}% · <span className="mono">{hit.vin}</span></p>
                <p className="mt-1 text-sm">{hit.excerpt}</p>
              </article>
            ))}
            {result.vector.length === 0 ? <p className="text-muted">None.</p> : null}
          </ResultCard>
          <ResultCard title="Summary">
            {result.fullText.map((hit) => (
              <article key={hit.inspection_id} className="border-t border-line py-3">
                <Link className="font-semibold" href={`/inspections/${hit.inspection_id}`}>
                  {hit.model_year} {hit.make} {hit.model}
                </Link>
                <p className="mt-1 text-sm">{hit.headline}</p>
              </article>
            ))}
            {result.fullText.length === 0 ? <p className="text-muted">None.</p> : null}
          </ResultCard>
          <ResultCard title="Narrative">
            {result.mongo.map((hit) => (
              <article key={hit.sqlInspectionId} className="border-t border-line py-3">
                <Link className="mono font-semibold" href={`/inspections/${hit.sqlInspectionId}`}>{hit.vin}</Link>
                <p className="mt-1 text-sm">{hit.excerpt}</p>
              </article>
            ))}
            {result.mongo.length === 0 ? <p className="text-muted">None.</p> : null}
          </ResultCard>
        </div>
      ) : null}
    </div>
  );
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
