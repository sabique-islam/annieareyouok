import { SignJWT, jwtVerify } from "jose";

export function sessionCookieName() {
  const value = process.env.SESSION_COOKIE;
  if (!value) throw new Error("SESSION_COOKIE is missing. Run npm run setup.");
  return value;
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) throw new Error("AUTH_SECRET is missing. Run npm run setup.");
  return new TextEncoder().encode(value);
}

export async function signSession(user: { user_id: number; role_name: string; full_name: string }) {
  return new SignJWT({
    uid: user.user_id,
    role: user.role_name,
    name: user.full_name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.user_id))
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret());
}

export async function readSessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  return {
    uid: Number(payload.uid),
    role: String(payload.role || ""),
    name: String(payload.name || ""),
  };
}
