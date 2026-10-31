import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceForm } from "@/components/fleet/PriceForm";
import { GradeStamp, ResultPill, Signal } from "@/components/ui/Marks";
import { canWrite, getSession } from "@/lib/auth/guard";
import { inr, km, num, signedInr, titleCase, when } from "@/lib/shared/format";
import { getVehicleFile } from "@/lib/fleet/vehicle-file";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Vehicle ${id}` };
}

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [file, user] = await Promise.all([getVehicleFile(Number(id)), getSession()]);
  if (!file) notFound();
  const { vehicle, inspections, checkpoints, defects, estimates, sales, dossier, similar } = file;
  const writer = user ? canWrite(user.role_name) : false;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="kicker">{vehicle.dealer_name} · {vehicle.dealer_city}</p>
          <h1 className="text-4xl">{vehicle.model_year} {vehicle.make} {vehicle.model}</h1>
          <p className="mt-1 text-muted">{vehicle.variant} · {vehicle.fuel_type} · {vehicle.transmission} · {vehicle.color}</p>
          <p className="mono mt-2 text-sm">{vehicle.vin}</p>
        </div>
        <div className="flex items-center gap-4">
          <GradeStamp grade={vehicle.current_grade} />
          <Signal value={vehicle.price_signal} />
        </div>
      </div>

      <section className="flex flex-wrap gap-x-14 gap-y-6">
        {[
          ["Asking price", inr(vehicle.list_price)],
          ["Model residual", inr(vehicle.estimated_value)],
          ["Gap", signedInr(vehicle.price_gap)],
          ["Odometer", km(vehicle.odometer_km)],
        ].map(([label, value]) => (
          <article key={label} className="sheet p-4">
            <p className="kicker">{label}</p>
            <p className="serif mt-2 text-2xl">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <h2 className="text-2xl">Residual</h2>
          <p className="text-sm text-muted">
            {vehicle.method_version ?? "—"}. Age {num(vehicle.age_factor, 3)}. Mileage {num(vehicle.mileage_factor, 3)}. Condition {num(vehicle.condition_factor, 3)}.
          </p>
          <div className="sheet">
            <table>
              <tbody>
                <tr><td>Gross before defects</td><td>{inr(vehicle.gross_value)}</td></tr>
                <tr><td>Defect penalty</td><td>{inr(vehicle.defect_penalty)}</td></tr>
                <tr><td>Residual</td><td>{inr(vehicle.estimated_value)}</td></tr>
                <tr><td>Age</td><td>{vehicle.age_years ?? "—"} years</td></tr>
                <tr><td>Basis</td><td className="capitalize">{titleCase(vehicle.assumptions)}</td></tr>
                <tr><td>Owners / accidents</td><td>{vehicle.owner_count} / {vehicle.accident_count}</td></tr>
                <tr><td>Status</td><td className="capitalize">{vehicle.status.replaceAll("_", " ")}</td></tr>
              </tbody>
            </table>
          </div>
          {estimates.length > 1 ? (
            <div className="sheet">
              <table>
                <thead>
                  <tr><th>Snapshot</th><th>Residual</th><th>Basis</th></tr>
                </thead>
                <tbody>
                  {estimates.map((row) => (
                    <tr key={String(row.estimate_id)}>
                      <td>{when(String(row.computed_at))}</td>
                      <td>{inr(row.estimated_value as string)}</td>
                      <td className="capitalize">{titleCase(String(row.assumptions))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="space-y-4">
          {writer ? <PriceForm vehicleId={vehicle.vehicle_id} listPrice={vehicle.list_price} /> : null}
          <div className="sheet p-4">
            <p className="kicker">Latest summary</p>
            <p className="mt-2">{vehicle.latest_summary ?? "No completed inspection yet."}</p>
            {vehicle.recommendation ? <p className="mt-2 font-semibold uppercase tracking-wide">{vehicle.recommendation}</p> : null}
          </div>
        </div>
      </section>

      {dossier ? (
        <section className="space-y-3">
          <h2 className="text-2xl">Dossier</h2>
          <div className="sheet space-y-3 p-5">
            <p>{dossier.narrative}</p>
            <p className="text-sm text-muted">
              {dossier.environment.city} · {dossier.environment.weather} · {dossier.environment.lighting}
            </p>
            {dossier.obdCodes.length > 0 ? (
              <ul className="text-sm">
                {dossier.obdCodes.map((code) => (
                  <li key={code.code}><span className="mono">{code.code}</span> — {code.description}</li>
                ))}
              </ul>
            ) : null}
            {dossier.media.length > 0 ? (
              <p className="text-sm">Attachments: {dossier.media.map((item) => item.label).join(", ")}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-2xl">Checkpoints</h2>
          <div className="sheet overflow-x-auto">
            <table>
              <thead><tr><th>Item</th><th>Result</th><th>Score</th><th>Severity</th></tr></thead>
              <tbody>
                {checkpoints.map((row) => (
                  <tr key={String(row.item_name)}>
                    <td>{String(row.item_name)}<div className="text-xs text-muted">{String(row.category)}</div></td>
                    <td><ResultPill result={String(row.result)} /></td>
                    <td>{num(row.score as string, 1)}</td>
                    <td className="capitalize">{String(row.severity)}</td>
                  </tr>
                ))}
                {checkpoints.length === 0 ? <tr><td colSpan={4}>No completed file.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-2xl">Defects</h2>
          <div className="sheet">
            <table>
              <thead><tr><th>Component</th><th>Severity</th><th>Repair</th></tr></thead>
              <tbody>
                {defects.map((row, index) => (
                  <tr key={index}>
                    <td>{String(row.component)}<div className="text-sm text-muted">{String(row.description)}</div></td>
                    <td className="capitalize">{String(row.severity)}{row.affects_safety ? " · safety" : ""}</td>
                    <td>{inr(row.repair_cost_estimate as string)}</td>
                  </tr>
                ))}
                {defects.length === 0 ? <tr><td colSpan={3}>No defects recorded.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-2xl">History</h2>
          <div className="sheet">
            <table>
              <thead><tr><th>Date</th><th>Score</th><th>Status</th></tr></thead>
              <tbody>
                {inspections.map((row) => (
                  <tr key={row.inspection_id}>
                    <td>
                      <Link className="rowlink" href={`/inspections/${row.inspection_id}`}>{when(row.inspection_date)}</Link>
                      <div className="text-xs text-muted">{row.inspector_name}</div>
                    </td>
                    <td>{num(row.overall_score, 1)} · {row.recommendation}</td>
                    <td className="capitalize">{row.status}</td>
                  </tr>
                ))}
                {inspections.length === 0 ? <tr><td colSpan={3}>Not inspected.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-2xl">Similar</h2>
          <div className="sheet">
            <table>
              <thead><tr><th>Car</th><th>Similarity</th></tr></thead>
              <tbody>
                {similar.map((hit) => (
                  <tr key={hit.inspection_id}>
                    <td>
                      <Link className="rowlink" href={`/fleet/${hit.vehicle_id}`}>{hit.model_year} {hit.make} {hit.model}</Link>
                      <div className="text-sm text-muted">{hit.excerpt}</div>
                    </td>
                    <td>{Math.round(Number(hit.similarity) * 100)}%</td>
                  </tr>
                ))}
                {similar.length === 0 ? <tr><td colSpan={2}>No comparison yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Sales</h2>
        <div className="sheet overflow-x-auto">
          <table>
            <thead><tr><th>Sold</th><th>Year</th><th>Km</th><th>Price</th><th>City</th><th>Source</th></tr></thead>
            <tbody>
              {sales.map((row) => (
                <tr key={String(row.sale_id)}>
                  <td>{when(String(row.sold_on))}</td>
                  <td>{String(row.model_year)}</td>
                  <td>{km(row.odometer_km as number)}</td>
                  <td>{inr(row.sale_price as string)}</td>
                  <td>{String(row.city)}</td>
                  <td>{String(row.source)}</td>
                </tr>
              ))}
              {sales.length === 0 ? <tr><td colSpan={6}>No recorded sales for this model.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
