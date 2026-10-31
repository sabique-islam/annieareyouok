import { NextResponse } from "next/server";
import { runNamedQuery } from "@/lib/admin/desk";
import { jsonError, requireUser } from "@/lib/auth/http";
import { NAMED_QUERIES } from "@/lib/queries/named-queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const name = new URL(request.url).searchParams.get("name");
  if (!name) return NextResponse.json({ queries: NAMED_QUERIES.map(({ sql, ...rest }) => rest) });
  try {
    const result = await runNamedQuery(name);
    if (!result) return NextResponse.json({ error: "Unknown query." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, "The query could not be run.");
  }
}
