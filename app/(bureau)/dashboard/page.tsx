import Link from "next/link";
import { GradeStamp, Signal } from "@/components/ui/Marks";
import { dashboard } from "@/lib/analytics/analytics";
import { inr, num, signedInr, when } from "@/lib/shared/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const data = await dashboard();
  const cards = [
    ["Fleet", data.totals.fleet],
    ["Inspections", data.totals.completed],
    ["Ask high", data.totals.overpriced],
    ["Ask low", data.totals.underpriced],
    ["Condition", num(data.totals.avg_condition, 1)],
  ];

  return (
    <div className="space-y-8">
      <h1>Dashboard</h1>
      <section className="flex flex-wrap gap-x-14 gap-y-6">
        {cards.map(([label, value]) => (
          <article key={label} className="sheet p-4">
            <p className="kicker">{label}</p>
            <p className="serif mt-2 text-3xl">{value}</p>
          </article>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Price gaps</h2>
        <div className="sheet overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Grade</th>
                <th>Car</th>
                <th>Ask</th>
                <th>Residual</th>
                <th>Gap</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.signals.map((row) => (
                <tr key={row.vehicle_id}>
                  <td><GradeStamp grade={row.current_grade} /></td>
                  <td>
                    <Link className="rowlink font-semibold" href={`/fleet/${row.vehicle_id}`}>
                      {row.model_year} {row.make} {row.model}
                    </Link>
                    <div className="mono text-xs text-muted">{row.vin}</div>
                  </td>
                  <td>{inr(row.list_price)}</td>
                  <td>{inr(row.estimated_value)}</td>
                  <td>{signedInr(row.price_gap)}</td>
                  <td><Signal value={row.price_signal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-2xl">Inspectors</h2>
          <div className="sheet">
            <table>
              <thead>
                <tr>
                  <th>Inspector</th>
                  <th>Files</th>
                  <th>Avg score</th>
                  <th>30 days</th>
                </tr>
              </thead>
              <tbody>
                {data.inspectors.map((row) => (
                  <tr key={String(row.full_name)}>
                    <td>{String(row.full_name)}</td>
                    <td>{String(row.completed_inspections)}</td>
                    <td>{num(row.avg_score as string, 1)}</td>
                    <td>{String(row.last_30_days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-2xl">Audit</h2>
          <div className="sheet">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((row, index) => {
                  const next = row.new_data as { list_price?: string; current_grade?: string; status?: string };
                  const prev = row.old_data as { list_price?: string; current_grade?: string; status?: string };
                  return (
                    <tr key={index}>
                      <td>{when(String(row.changed_at))}</td>
                      <td>{String(row.changed_by ?? "system")}</td>
                      <td className="text-sm">
                        {prev?.list_price !== next?.list_price ? <div>Ask {inr(prev?.list_price)} → {inr(next?.list_price)}</div> : null}
                        {prev?.current_grade !== next?.current_grade ? <div>Grade {prev?.current_grade ?? "—"} → {next?.current_grade ?? "—"}</div> : null}
                        {prev?.status !== next?.status ? <div>Status {prev?.status} → {next?.status}</div> : null}
                        <div className="text-muted">Vehicle {String(row.record_id)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
