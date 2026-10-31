import { NextResponse } from "next/server";
import { createMarketSale, listMarket } from "@/lib/admin/desk";
import { jsonError, requireUser } from "@/lib/auth/http";
import { marketSchema } from "@/lib/shared/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json({ sales: await listMarket() });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin", "inspector"]);
  if (auth.error) return auth.error;
  const parsed = marketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sale." }, { status: 400 });
  }
  try {
    const saleId = await createMarketSale(parsed.data);
    return NextResponse.json({ saleId }, { status: 201 });
  } catch (error) {
    return jsonError(error, "The sale could not be recorded.");
  }
}
