import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/http";
import { searchCorpus } from "@/lib/search/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const result = await searchCorpus(q);
  return NextResponse.json(result);
}
