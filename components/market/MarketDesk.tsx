"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Model = { id: number; label: string };

export function MarketForm({ models }: { models: Model[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/market", {
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
    <form onSubmit={onSubmit} className="sheet grid gap-3 p-4 md:grid-cols-4">
      <label className="field md:col-span-2">
        <span>Model</span>
        <select name="modelId" defaultValue={models[0]?.id}>
          {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select>
      </label>
      <label className="field"><span>Year</span><input name="modelYear" type="number" min={1995} max={2030} required defaultValue={2019} /></label>
      <label className="field"><span>Odometer</span><input name="odometerKm" type="number" min={0} required /></label>
      <label className="field"><span>Sale price</span><input name="salePrice" type="number" min={1} required /></label>
      <label className="field"><span>Condition</span><input name="conditionScore" type="number" min={0} max={100} defaultValue={70} /></label>
      <label className="field"><span>City</span><input name="city" required defaultValue="Bengaluru" /></label>
      <label className="field"><span>Sold on</span><input name="soldOn" type="date" required /></label>
      <label className="field md:col-span-2"><span>Source</span><input name="source" required defaultValue="yard book" /></label>
      {error ? <p className="error md:col-span-4">{error}</p> : null}
      <div className="md:col-span-4">
        <button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

export function DeleteSaleButton({ saleId }: { saleId: number }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onClick() {
    const response = await fetch(`/api/market/${saleId}`, { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setError(body.error || "Could not delete.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" onClick={onClick}>Delete</button>
      {error ? <p className="error mt-2">{error}</p> : null}
    </div>
  );
}
