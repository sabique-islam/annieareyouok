import { query } from "../db/postgres";
import { dossiers } from "../db/mongo";
import type { FleetRow } from "../fleet/fleet";

export async function dashboard() {
  const [totals] = await query<{
    fleet: string;
    completed: string;
    overpriced: string;
    underpriced: string;
    avg_condition: string | null;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM vehicles) AS fleet,
       (SELECT COUNT(*) FROM inspections WHERE status = 'completed') AS completed,
       (SELECT COUNT(*) FROM vw_fleet_intelligence WHERE price_signal = 'overpriced') AS overpriced,
       (SELECT COUNT(*) FROM vw_fleet_intelligence WHERE price_signal = 'underpriced') AS underpriced,
       (SELECT ROUND(AVG(condition_score), 1) FROM vehicles) AS avg_condition`,
  );

  const signals = await query<FleetRow>(
    `SELECT * FROM vw_fleet_intelligence
     WHERE price_signal IN ('overpriced', 'underpriced')
     ORDER BY ABS(price_gap) DESC
     LIMIT 8`,
  );
  const inspectors = await query(
    `SELECT full_name, completed_inspections, avg_score, last_30_days
     FROM vw_inspector_load
     ORDER BY completed_inspections DESC`,
  );
  const audit = await query(
    `SELECT a.changed_at, u.full_name AS changed_by, a.record_id, a.old_data, a.new_data
     FROM audit_log a
     LEFT JOIN users u ON u.user_id = a.changed_by
     ORDER BY a.changed_at DESC
     LIMIT 6`,
  );
  return { totals, signals, inspectors, audit };
}

export async function analytics() {
  const byMake = await query<{
    make: string;
    cars: string;
    avg_condition: string | null;
    avg_ask: string | null;
    avg_residual: string | null;
  }>(
    `SELECT make,
            COUNT(*) AS cars,
            ROUND(AVG(condition_score), 1) AS avg_condition,
            ROUND(AVG(list_price), 0) AS avg_ask,
            ROUND(AVG(estimated_value), 0) AS avg_residual
     FROM vw_fleet_intelligence
     GROUP BY make
     ORDER BY cars DESC, make`,
  );

  const repairs = await query(
    `SELECT cm.make,
            d.severity,
            COUNT(*) AS defects,
            SUM(d.repair_cost_estimate) AS repair_total
     FROM defects d
     JOIN inspections i ON i.inspection_id = d.inspection_id AND i.status = 'completed'
     JOIN vehicles v ON v.vehicle_id = i.vehicle_id
     JOIN catalog_models cm ON cm.model_id = v.model_id
     GROUP BY cm.make, d.severity
     HAVING SUM(d.repair_cost_estimate) > 0
     ORDER BY repair_total DESC`,
  );

  const inspectors = await query(
    `SELECT * FROM vw_inspector_load ORDER BY completed_inspections DESC`,
  );

  const collection = await dossiers();
  const byCity = await collection
    .aggregate<{ _id: { city: string; weather: string }; inspections: number; avgNarrativeChars: number }>([
      {
        $group: {
          _id: { city: "$environment.city", weather: "$environment.weather" },
          inspections: { $sum: 1 },
          avgNarrativeChars: { $avg: { $strLenCP: "$narrative" } },
        },
      },
      { $sort: { inspections: -1, "_id.city": 1 } },
    ])
    .toArray();

  const obd = await collection
    .aggregate<{ _id: string; description: string; count: number }>([
      { $unwind: "$obdCodes" },
      {
        $group: {
          _id: "$obdCodes.code",
          description: { $first: "$obdCodes.description" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])
    .toArray();

  return { byMake, repairs, inspectors, byCity, obd };
}
