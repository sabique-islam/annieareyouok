import { NextResponse } from "next/server";
import { analytics } from "@/lib/analytics/analytics";
import { requireUser } from "@/lib/auth/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  return NextResponse.json(await analytics());
}
