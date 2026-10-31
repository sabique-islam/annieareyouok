import { NextResponse } from "next/server";
import { createVehicle, listFleet } from "@/lib/fleet/fleet";
import { jsonError, requireUser } from "@/lib/auth/http";
import { vehicleSchema } from "@/lib/shared/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const rows = await listFleet({
    make: url.searchParams.get("make") ?? undefined,
    grade: url.searchParams.get("grade") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ vehicles: rows });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin", "inspector"]);
  if (auth.error) return auth.error;
  const parsed = vehicleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid vehicle." }, { status: 400 });
  }
  try {
    const vehicleId = await createVehicle(parsed.data, auth.user.user_id);
    return NextResponse.json({ vehicleId }, { status: 201 });
  } catch (error) {
    return jsonError(error, "The vehicle could not be saved.");
  }
}
