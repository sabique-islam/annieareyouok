"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PriceForm({ vehicleId, listPrice }: { vehicleId: number; listPrice: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const listPriceValue = new FormData(event.currentTarget).get("listPrice");
    const response = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listPrice: listPriceValue }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.error || "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="sheet space-y-3 p-4">
      <p className="kicker">Ask</p>
      <label className="field">
        <span>Asking price (INR)</span>
        <input name="listPrice" type="number" min={1} defaultValue={Math.round(Number(listPrice))} required />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
