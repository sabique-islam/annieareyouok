import { NextResponse } from "next/server";
import { completeInspection } from "@/lib/inspections/inspections";
import { jsonError, requireUser } from "@/lib/auth/http";
import { inspectionSchema } from "@/lib/shared/validators";

export async function POST(request: Request) {
  const auth = await requireUser(["admin", "inspector"]);
  if (auth.error) return auth.error;
  const parsed = inspectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid inspection." }, { status: 400 });
  }
  try {
    const result = await completeInspection(parsed.data, auth.user.user_id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error, "The inspection could not be completed.");
  }
}
