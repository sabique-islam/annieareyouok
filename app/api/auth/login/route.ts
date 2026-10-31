import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { demoCredentials } from "@/lib/auth/accounts.mjs";
import { query } from "@/lib/db/postgres";
import { signSession, sessionCookieName } from "@/lib/auth/session";
import { loginSchema } from "@/lib/shared/validators";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sign-in." }, { status: 400 });
  }

  const submitted = "demo" in parsed.data ? demoCredentials(parsed.data.demo) : parsed.data;
  const rows = await query<{
    user_id: number;
    full_name: string;
    role_name: string;
    password_hash: string;
    is_active: boolean;
  }>(
    `SELECT u.user_id, u.full_name, u.password_hash, u.is_active, r.role_name
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.email = lower($1)`,
    [submitted.email],
  );
  const user = rows[0];
  const valid = user ? await bcrypt.compare(submitted.password, user.password_hash) : false;
  if (!user || !valid || !user.is_active) {
    return NextResponse.json({ error: "Email or password is not recognised." }, { status: 401 });
  }

  const token = await signSession(user);
  const response = NextResponse.json({ ok: true, role: user.role_name, name: user.full_name });
  response.cookies.set({
    name: sessionCookieName(),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
