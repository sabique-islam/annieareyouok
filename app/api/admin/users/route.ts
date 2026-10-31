import { NextResponse } from "next/server";
import { createUser, listUsers } from "@/lib/admin/desk";
import { jsonError, requireUser } from "@/lib/auth/http";
import { userSchema } from "@/lib/shared/validators";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  const auth = await requireUser(["admin"]);
  if (auth.error) return auth.error;
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid user." }, { status: 400 });
  }
  try {
    const userId = await createUser(parsed.data);
    return NextResponse.json({ userId }, { status: 201 });
  } catch (error) {
    return jsonError(error, "The user could not be created.");
  }
}
