import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "./guard";

export async function requireUser(roles?: string[]): Promise<
  { user: SessionUser; error: null } | { user: null; error: NextResponse }
> {
  const user = await getSession();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role_name)) {
    return { user: null, error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  }
  return { user, error: null };
}

export function jsonError(err: unknown, fallback = "The database rejected that change.") {
  const error = err as { code?: string; message?: string };
  if (error.code === "23505") {
    return NextResponse.json({ error: "That value is already in use." }, { status: 409 });
  }
  if (error.code === "23514" || error.code === "23503" || error.code === "P0001") {
    const message = error.message?.replace(/^.*ERROR:\s*/, "") || fallback;
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
