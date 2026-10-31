"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VoidButton({ inspectionId }: { inspectionId: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!window.confirm("Void this inspection?")) return;
    setPending(true);
    setError("");
    const response = await fetch(`/api/inspections/${inspectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "void" }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.error || "Could not void.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={onClick} disabled={pending}>{pending ? "Voiding…" : "Void"}</button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
