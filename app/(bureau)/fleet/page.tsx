import Link from "next/link";
import { GradeStamp, Signal } from "@/components/ui/Marks";
import { canWrite, getSession } from "@/lib/auth/guard";
import { listFleet, listMakes } from "@/lib/fleet/fleet";
import { inr, km, num } from "@/lib/shared/format";

export const metadata = { title: "Fleet" };

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ make?: string; grade?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const [rows, makes, user] = await Promise.all([
    listFleet(params),
    listMakes(),
    getSession(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Fleet</h1>
        </div>
        {user && canWrite(user.role_name) ? (
          <Link className="button primary" href="/fleet/new">Add vehicle</Link>
        ) : null}
      </div>
      <form className="sheet grid gap-3 p-4 md:grid-cols-5" action="/fleet">
        <label className="field md:col-span-2">
          <span>Search</span>
          <input name="q" defaultValue={params.q ?? ""} placeholder="VIN, make, model" />
        </label>
        <label className="field">
          <span>Make</span>
          <select name="make" defaultValue={params.make ?? ""}>
            <option value="">Any</option>
            {makes.map((make) => <option key={make}>{make}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Grade</span>
          <select name="grade" defaultValue={params.grade ?? ""}>
            <option value="">Any</option>
            {["A", "B", "C", "D", "F"].map((grade) => <option key={grade}>{grade}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={params.status ?? ""}>
            <option value="">Any</option>
            {["available", "under_inspection", "sold", "withdrawn"].map((status) => (
              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <div className="md:col-span-5">
          <button className="primary" type="submit">Filter</button>
        </div>
      </form>
      <div className="sheet overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Grade</th>
              <th>Car</th>
              <th>Odometer</th>
              <th>Ask</th>
              <th>Residual</th>
              <th>Signal</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.vehicle_id}>
                <td><GradeStamp grade={row.current_grade} /></td>
                <td>
                  <Link className="rowlink font-semibold" href={`/fleet/${row.vehicle_id}`}>
                    {row.model_year} {row.make} {row.model} {row.variant}
                  </Link>
                  <div className="mono text-xs text-muted">{row.vin} · {row.dealer_city}</div>
                </td>
                <td>{km(row.odometer_km)}</td>
                <td>{inr(row.list_price)}</td>
                <td>{inr(row.estimated_value)}{row.condition_score ? <div className="text-xs text-muted">score {num(row.condition_score, 1)}</div> : null}</td>
                <td><Signal value={row.price_signal} /></td>
                <td className="capitalize">{row.status.replaceAll("_", " ")}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={7}>None.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
