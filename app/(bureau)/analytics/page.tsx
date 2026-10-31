import { analytics } from "@/lib/analytics/analytics";
import { inr, num } from "@/lib/shared/format";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const data = await analytics();
  const maxCars = Math.max(...data.byMake.map((row) => Number(row.cars)), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1>Analytics</h1>
      </div>

      <section className="sheet p-5">
        <h2 className="text-2xl">By make</h2>
        <div className="mt-4 space-y-3">
          {data.byMake.map((row) => (
            <div key={row.make} className="grid items-center gap-3 md:grid-cols-[8rem_1fr_auto]">
              <div className="font-semibold">{row.make}</div>
              <div className="bar"><span style={{ width: `${(Number(row.cars) / maxCars) * 100}%` }} /></div>
              <div className="text-sm text-muted">
                {row.cars} cars · condition {num(row.avg_condition, 1)} · ask {inr(row.avg_ask)} · residual {inr(row.avg_residual)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Repair exposure</h2>
        <div className="sheet overflow-x-auto">
          <table>
            <thead><tr><th>Make</th><th>Severity</th><th>Defects</th><th>Repair total</th></tr></thead>
            <tbody>
              {data.repairs.map((row, index) => (
                <tr key={index}>
                  <td>{String(row.make)}</td>
                  <td className="capitalize">{String(row.severity)}</td>
                  <td>{String(row.defects)}</td>
                  <td>{inr(row.repair_total as string)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-2xl">City and weather</h2>
          <div className="sheet">
            <table>
              <thead><tr><th>City</th><th>Weather</th><th>Files</th><th>Avg narrative</th></tr></thead>
              <tbody>
                {data.byCity.map((row) => (
                  <tr key={`${row._id.city}-${row._id.weather}`}>
                    <td>{row._id.city}</td>
                    <td>{row._id.weather}</td>
                    <td>{row.inspections}</td>
                    <td>{Math.round(row.avgNarrativeChars)} chars</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-2xl">OBD codes</h2>
          <div className="sheet">
            <table>
              <thead><tr><th>Code</th><th>Description</th><th>Count</th></tr></thead>
              <tbody>
                {data.obd.map((row) => (
                  <tr key={row._id}>
                    <td className="mono">{row._id}</td>
                    <td>{row.description}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
                {data.obd.length === 0 ? <tr><td colSpan={3}>None.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
