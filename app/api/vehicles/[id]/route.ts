import { NextResponse } from "next/server";
import { updateListPrice } from "@/lib/fleet/fleet";
import { jsonError, requireUser } from "@/lib/auth/http";
import { getVehicleFile } from "@/lib/fleet/vehicle-file";
import { priceSchema } from "@/lib/shared/validators";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const file = await getVehicleFile(Number(id));
  if (!file) return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
  return NextResponse.json(file);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin", "inspector"]);
  if (auth.error) return auth.error;
  const parsed = priceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid price." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const updated = await updateListPrice(Number(id), parsed.data.listPrice, auth.user.user_id);
    if (!updated) return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "The asking price could not be updated.");
  }
}
