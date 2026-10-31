import { NextResponse } from "next/server";
import { getInspection, voidInspection } from "@/lib/inspections/inspections";
import { jsonError, requireUser } from "@/lib/auth/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const { id } = await context.params;
  const file = await getInspection(Number(id));
  if (!file) return NextResponse.json({ error: "Inspection not found." }, { status: 404 });
  return NextResponse.json(file);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin", "inspector"]);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  if (body?.status !== "void") {
    return NextResponse.json({ error: "Only void is supported." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const vehicleId = await voidInspection(Number(id), auth.user.user_id);
    return NextResponse.json({ ok: true, vehicleId });
  } catch (error) {
    return jsonError(error, "The inspection could not be voided.");
  }
}
