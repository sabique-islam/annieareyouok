"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEMOS = [
  { role: "admin", label: "Admin" },
  { role: "inspector", label: "Inspector" },
  { role: "buyer", label: "Buyer" },
] as const;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signIn(payload: { email: string; password: string } | { demo: (typeof DEMOS)[number]["role"] }) {
    setPending(true);
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.error || "Sign-in failed.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void signIn({ email, password });
      }}
      className="space-y-4"
    >
      <div className="space-y-1">
        {DEMOS.map((demo) => (
          <p key={demo.role}>
            <button type="button" disabled={pending} onClick={() => void signIn({ demo: demo.role })}>
              {demo.label}
            </button>
          </p>
        ))}
      </div>
      <label className="field">
        <span>Email</span>
        <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
