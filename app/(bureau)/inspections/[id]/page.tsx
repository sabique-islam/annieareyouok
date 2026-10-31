import Link from "next/link";
import { notFound } from "next/navigation";
import { VoidButton } from "@/components/inspections/VoidButton";
import { ResultPill } from "@/components/ui/Marks";
import { canWrite, getSession } from "@/lib/auth/guard";
import { inr, km, num, when } from "@/lib/shared/format";
import { getInspection } from "@/lib/inspections/inspections";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `Inspection ${id}` };
}

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [file, user] = await Promise.all([getInspection(Number(id)), getSession()]);
  if (!file) notFound();
  const { inspection, checkpoints, defects, dossier } = file;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">Inspection {inspection.inspection_id}</p>
          <h1 className="text-4xl">
            <Link href={`/fleet/${inspection.vehicle_id}`}>{inspection.model_year} {inspection.make} {inspection.model}</Link>
          </h1>
          <p className="mono mt-2 text-sm">{inspection.vin}</p>
          <p className="mt-2 text-muted">
            {when(inspection.inspection_date)} · {inspection.inspector_name} · {km(inspection.odometer_km)} · score {num(inspection.overall_score, 1)} · {inspection.recommendation}
          </p>
        </div>
        <div className="space-y-3 text-right">
          <p className="kicker">{inspection.status}</p>
          {user && canWrite(user.role_name) && inspection.status === "completed" ? (
            <VoidButton inspectionId={inspection.inspection_id} />
          ) : null}
        </div>
      </div>

      <section className="sheet p-5">
        <p className="kicker">Summary</p>
        <p className="mt-2">{inspection.summary}</p>
      </section>

      {dossier ? (
        <section className="sheet space-y-2 p-5">
          <p className="kicker">Narrative</p>
          <p>{dossier.narrative}</p>
          <p className="text-sm text-muted">{dossier.environment.city} · {dossier.environment.weather} · {dossier.environment.lighting}</p>
        </section>
      ) : null}

      <div className="sheet overflow-x-auto">
        <table>
          <thead><tr><th>Checkpoint</th><th>Result</th><th>Score</th><th>Severity</th></tr></thead>
          <tbody>
            {checkpoints.map((row) => (
              <tr key={String(row.item_name)}>
                <td>{String(row.item_name)}</td>
                <td><ResultPill result={String(row.result)} /></td>
                <td>{num(row.score as string, 1)}</td>
                <td className="capitalize">{String(row.severity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sheet">
        <table>
          <thead><tr><th>Defect</th><th>Severity</th><th>Repair</th></tr></thead>
          <tbody>
            {defects.map((row, index) => (
              <tr key={index}>
                <td>{String(row.component)}<div className="text-sm text-muted">{String(row.description)}</div></td>
                <td className="capitalize">{String(row.severity)}</td>
                <td>{inr(row.repair_cost_estimate as string)}</td>
              </tr>
            ))}
            {defects.length === 0 ? <tr><td colSpan={3}>No defects on this file.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
