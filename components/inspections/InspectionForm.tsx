"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CHECKPOINTS, RESULT_DEFAULTS } from "@/lib/inspections/checklist.mjs";

type VehicleOption = { id: number; label: string; odometer: number };
type Checkpoint = {
  category: string;
  itemName: string;
  result: "pass" | "advisory" | "fail" | "not_tested";
  score: number;
  severity: "none" | "minor" | "moderate" | "major" | "critical";
};
type Defect = {
  component: string;
  description: string;
  severity: "minor" | "moderate" | "major" | "critical";
  repairCost: number;
  affectsSafety: boolean;
  itemName: string;
};

const blankCheckpoint = (): Checkpoint[] =>
  CHECKPOINTS.map((item) => ({
    category: item.category,
    itemName: item.itemName,
    result: "pass",
    score: RESULT_DEFAULTS.pass.score,
    severity: "none",
  }));

export function InspectionForm({ vehicles }: { vehicles: VehicleOption[] }) {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? 0);
  const [odometer, setOdometer] = useState(vehicles[0]?.odometer ?? 0);
  const [summary, setSummary] = useState("");
  const [narrative, setNarrative] = useState("");
  const [recommendation, setRecommendation] = useState("negotiate");
  const [city, setCity] = useState("Bengaluru");
  const [weather, setWeather] = useState("Dry");
  const [lighting, setLighting] = useState("Bay light");
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(blankCheckpoint);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const selected = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId),
    [vehicleId, vehicles],
  );

  function setResult(index: number, result: Checkpoint["result"]) {
    const defaults = RESULT_DEFAULTS[result];
    setCheckpoints((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? { ...row, result, score: defaults.score, severity: defaults.severity as Checkpoint["severity"] }
          : row,
      ),
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const response = await fetch("/api/inspections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId,
        odometerKm: odometer,
        summary,
        narrative,
        recommendation,
        environment: { city, weather, lighting },
        checkpoints,
        defects,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string; inspectionId?: number };
    setPending(false);
    if (!response.ok || !body.inspectionId) {
      setError(body.error || "Could not save.");
      return;
    }
    router.push(`/inspections/${body.inspectionId}`);
    router.refresh();
  }

  if (vehicles.length === 0) {
    return <p>No vehicles.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="sheet grid gap-4 p-5 md:grid-cols-2">
        <label className="field md:col-span-2">
          <span>Vehicle</span>
          <select
            value={vehicleId}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVehicleId(next);
              const match = vehicles.find((vehicle) => vehicle.id === next);
              if (match) setOdometer(match.odometer);
            }}
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Odometer (km)</span>
          <input type="number" min={selected?.odometer ?? 0} value={odometer} onChange={(event) => setOdometer(Number(event.target.value))} required />
        </label>
        <label className="field">
          <span>Recommendation</span>
          <select value={recommendation} onChange={(event) => setRecommendation(event.target.value)}>
            <option value="buy">Buy</option>
            <option value="negotiate">Negotiate</option>
            <option value="avoid">Avoid</option>
          </select>
        </label>
        <label className="field md:col-span-2">
          <span>Summary</span>
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} required minLength={20} maxLength={600} />
        </label>
        <label className="field">
          <span>City</span>
          <input value={city} onChange={(event) => setCity(event.target.value)} required />
        </label>
        <label className="field">
          <span>Weather</span>
          <input value={weather} onChange={(event) => setWeather(event.target.value)} required />
        </label>
        <label className="field md:col-span-2">
          <span>Lighting</span>
          <input value={lighting} onChange={(event) => setLighting(event.target.value)} required />
        </label>
        <label className="field md:col-span-2">
          <span>Narrative</span>
          <textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} required minLength={40} maxLength={4000} />
        </label>
      </div>

      <div className="space-y-8">
        {[...new Set(checkpoints.map((row) => row.category))].map((category) => (
          <section key={category}>
            <h2 className="mb-3 text-2xl capitalize">{category}</h2>
            <div className="sheet overflow-x-auto">
              <table>
                <thead>
                  <tr><th>Checkpoint</th><th>Result</th><th>Score</th><th>Severity</th></tr>
                </thead>
                <tbody>
                  {checkpoints.map((row, index) => row.category === category ? (
                    <tr key={row.itemName}>
                      <td>{row.itemName}</td>
                      <td>
                        <select value={row.result} onChange={(event) => setResult(index, event.target.value as Checkpoint["result"])}>
                          <option value="pass">Pass</option>
                          <option value="advisory">Advisory</option>
                          <option value="fail">Fail</option>
                          <option value="not_tested">Not tested</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step="0.5"
                          value={row.score}
                          onChange={(event) =>
                            setCheckpoints((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, score: Number(event.target.value) } : item))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={row.severity}
                          onChange={(event) =>
                            setCheckpoints((rows) => rows.map((item, itemIndex) => itemIndex === index ? { ...item, severity: event.target.value as Checkpoint["severity"] } : item))
                          }
                        >
                          {["none", "minor", "moderate", "major", "critical"].map((severity) => (
                            <option key={severity} value={severity}>{severity === "none" ? "None" : severity[0].toUpperCase() + severity.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ) : null)}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl">Defects</h2>
          <button
            type="button"
            onClick={() =>
              setDefects((rows) => [
                ...rows,
                { component: "", description: "", severity: "moderate", repairCost: 0, affectsSafety: false, itemName: "" },
              ])
            }
          >
            Add defect
          </button>
        </div>
        {defects.map((defect, index) => (
          <div key={index} className="sheet grid gap-3 p-4 md:grid-cols-2">
            <label className="field"><span>Component</span><input value={defect.component} onChange={(event) => setDefects((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, component: event.target.value } : row))} required /></label>
            <label className="field">
              <span>Checkpoint</span>
              <select value={defect.itemName} onChange={(event) => setDefects((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, itemName: event.target.value } : row))}>
                <option value="">None</option>
                {CHECKPOINTS.map((item) => <option key={item.itemName}>{item.itemName}</option>)}
              </select>
            </label>
            <label className="field md:col-span-2"><span>Description</span><input value={defect.description} onChange={(event) => setDefects((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))} required minLength={8} /></label>
            <label className="field">
              <span>Severity</span>
              <select value={defect.severity} onChange={(event) => setDefects((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, severity: event.target.value as Defect["severity"] } : row))}>
                {["minor", "moderate", "major", "critical"].map((severity) => (
                  <option key={severity} value={severity}>{severity[0].toUpperCase() + severity.slice(1)}</option>
                ))}
              </select>
            </label>
            <label className="field"><span>Repair (INR)</span><input type="number" min={0} value={defect.repairCost} onChange={(event) => setDefects((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, repairCost: Number(event.target.value) } : row))} /></label>
            <label className="flex items-center gap-2 text-sm">
              <input className="h-4 w-4" type="checkbox" checked={defect.affectsSafety} onChange={(event) => setDefects((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, affectsSafety: event.target.checked } : row))} />
              Affects safety
            </label>
            <button type="button" onClick={() => setDefects((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove</button>
          </div>
        ))}
      </section>

      {error ? <p className="error">{error}</p> : null}
      <button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
