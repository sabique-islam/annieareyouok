import { redirect } from "next/navigation";
import { InspectionForm } from "@/components/inspections/InspectionForm";
import { canWrite, getSession } from "@/lib/auth/guard";
import { listFleet } from "@/lib/fleet/fleet";

export const metadata = { title: "New inspection" };

export default async function NewInspectionPage() {
  const user = await getSession();
  if (!user || !canWrite(user.role_name)) redirect("/dashboard");
  const fleet = await listFleet();

  return (
    <div className="space-y-6">
      <div>
        <h1>New inspection</h1>
      </div>
      <InspectionForm
        vehicles={fleet.map((row) => ({
          id: row.vehicle_id,
          label: `${row.model_year} ${row.make} ${row.model} · ${row.vin}`,
          odometer: row.odometer_km,
        }))}
      />
    </div>
  );
}
