import Link from "next/link";
import { runNamedQuery } from "@/lib/admin/desk";
import { NAMED_QUERIES } from "@/lib/queries/named-queries";

export const metadata = { title: "Queries" };

export default async function QueriesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  const result = name ? await runNamedQuery(name) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1>Queries</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {NAMED_QUERIES.map((query) => (
          <Link key={query.name} className={`button ${name === query.name ? "primary" : ""}`} href={`/queries?name=${query.name}`}>
            {query.title}
          </Link>
        ))}
      </div>
      {result ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-2xl">{result.spec.title}</h2>
            <p className="text-sm text-muted">{result.spec.shows}</p>
          </div>
          <pre className="sheet overflow-x-auto p-4 text-sm"><code>{result.spec.sql}</code></pre>
          <div className="sheet overflow-x-auto">
            <table>
              <thead>
                <tr>{result.columns.map((column) => <th key={column}>{column}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index}>
                    {result.columns.map((column) => (
                      <td key={column}>{formatCell(row[column])}</td>
                    ))}
                  </tr>
                ))}
                {result.rows.length === 0 ? (
                  <tr><td colSpan={result.columns.length}>None.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
