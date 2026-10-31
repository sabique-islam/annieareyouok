import { NextResponse } from "next/server";
import { deleteMarketSale } from "@/lib/admin/desk";
import { jsonError, requireUser } from "@/lib/auth/http";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["admin", "inspector"]);
  if (auth.error) return auth.error;
  const { id } = await context.params;
  try {
    const removed = await deleteMarketSale(Number(id));
    if (!removed) return NextResponse.json({ error: "Sale not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "The sale could not be deleted.");
  }
}
