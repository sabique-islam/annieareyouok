import { redirect } from "next/navigation";
import { VehicleForm } from "@/components/fleet/VehicleForm";
import { canWrite, getSession } from "@/lib/auth/guard";
import { listCatalog, listDealers } from "@/lib/fleet/fleet";

export const metadata = { title: "Add a car" };

export default async function NewVehiclePage() {
  const user = await getSession();
  if (!user || !canWrite(user.role_name)) redirect("/fleet");
  const [models, dealers] = await Promise.all([listCatalog(), listDealers()]);

  return (
    <div className="space-y-6">
      <div>
        <h1>New vehicle</h1>
      </div>
      <VehicleForm
        models={models.map((model) => ({ id: model.model_id, label: `${model.make} ${model.model}` }))}
        dealers={dealers.map((dealer) => ({ id: dealer.dealer_id, label: `${dealer.name}, ${dealer.city}` }))}
      />
    </div>
  );
}
