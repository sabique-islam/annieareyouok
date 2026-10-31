import { NextResponse } from "next/server";
import { setUserActive } from "@/lib/admin/desk";
import { jsonError, requireUser } from "@/lib/auth/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => null)) as { isActive?: boolean } | null;
  if (typeof body?.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be true or false." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const updated = await setUserActive(Number(id), body.isActive);
    if (!updated) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "The account could not be updated.");
  }
}
