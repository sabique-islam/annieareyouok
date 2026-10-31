"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Option = { id: number; label: string };

export function VehicleForm({ models, dealers }: { models: Option[]; dealers: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; vehicleId?: number };
    setPending(false);
    if (!response.ok || !body.vehicleId) {
      setError(body.error || "Could not save.");
      return;
    }
    router.push(`/fleet/${body.vehicleId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="sheet grid gap-4 p-5 md:grid-cols-2">
      <label className="field md:col-span-2">
        <span>VIN</span>
        <input name="vin" className="mono" required minLength={17} maxLength={17} placeholder="17 characters, no I, O, or Q" />
      </label>
      <label className="field">
        <span>Model</span>
        <select name="modelId" required defaultValue={models[0]?.id}>
          {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Dealer</span>
        <select name="dealerId" required defaultValue={dealers[0]?.id}>
          {dealers.map((dealer) => <option key={dealer.id} value={dealer.id}>{dealer.label}</option>)}
        </select>
      </label>
      <label className="field"><span>Variant</span><input name="variant" required /></label>
      <label className="field"><span>Model year</span><input name="modelYear" type="number" min={1995} max={2030} required defaultValue={2020} /></label>
      <label className="field">
        <span>Fuel</span>
        <select name="fuelType" defaultValue="petrol">
          {["petrol", "diesel", "cng", "electric", "hybrid"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Transmission</span>
        <select name="transmission" defaultValue="manual">
          {["manual", "automatic", "amt", "cvt", "dct"].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="field"><span>Odometer (km)</span><input name="odometerKm" type="number" min={0} required /></label>
      <label className="field"><span>Colour</span><input name="color" required defaultValue="White" /></label>
      <label className="field"><span>Registration</span><input name="registrationState" required defaultValue="KA" /></label>
      <label className="field"><span>Owners</span><input name="ownerCount" type="number" min={1} max={12} defaultValue={1} required /></label>
      <label className="field"><span>Accidents</span><input name="accidentCount" type="number" min={0} max={20} defaultValue={0} required /></label>
      <label className="field"><span>Asking price (INR)</span><input name="listPrice" type="number" min={1} required /></label>
      <label className="field"><span>Original MSRP (INR)</span><input name="originalMsrp" type="number" min={1} required /></label>
      <label className="field">
        <span>Status</span>
        <select name="status" defaultValue="available">
          <option value="available">Available</option>
          <option value="under_inspection">Under inspection</option>
        </select>
      </label>
      {error ? <p className="error md:col-span-2">{error}</p> : null}
      <div className="md:col-span-2">
        <button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
