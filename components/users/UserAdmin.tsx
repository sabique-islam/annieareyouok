"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UserAdmin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.error || "Could not save.");
      return;
    }
    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="sheet grid gap-3 p-4 md:grid-cols-2">
      <label className="field"><span>Name</span><input name="fullName" required minLength={2} /></label>
      <label className="field"><span>Email</span><input name="email" type="email" required /></label>
      <label className="field"><span>Password</span><input name="password" type="password" required minLength={8} /></label>
      <label className="field">
        <span>Role</span>
        <select name="roleName" defaultValue="inspector">
          <option value="admin">Admin</option>
          <option value="inspector">Inspector</option>
          <option value="buyer">Buyer</option>
        </select>
      </label>
      {error ? <p className="error md:col-span-2">{error}</p> : null}
      <div className="md:col-span-2">
        <button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Create"}</button>
      </div>
    </form>
  );
}

export function ActiveToggle({ userId, isActive }: { userId: number; isActive: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onClick() {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(body.error || "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={onClick}>{isActive ? "Deactivate" : "Activate"}</button>
      {error ? <p className="error mt-2">{error}</p> : null}
    </div>
  );
}
