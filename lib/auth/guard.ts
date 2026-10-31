import { cookies } from "next/headers";
import { query } from "../db/postgres";
import { readSessionToken, sessionCookieName } from "./session";

export type SessionUser = {
  user_id: number;
  full_name: string;
  email: string;
  role_name: string;
};

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;

  try {
    const payload = await readSessionToken(token);
    const rows = await query<SessionUser>(
      `SELECT u.user_id, u.full_name, u.email, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.is_active`,
      [payload.uid],
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export function canWrite(role: string) {
  return role === "admin" || role === "inspector";
}
