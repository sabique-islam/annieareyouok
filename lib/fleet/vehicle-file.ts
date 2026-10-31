import { query } from "../db/postgres";
import { dossiers } from "../db/mongo";
import { searchCorpus } from "../search/search";
import type { FleetRow } from "./fleet";

export async function getVehicleFile(vehicleId: number) {
  const vehicles = await query<FleetRow>(
    `SELECT * FROM vw_fleet_intelligence WHERE vehicle_id = $1`,
    [vehicleId],
  );
  const vehicle = vehicles[0];
  if (!vehicle) return null;

  const inspections = await query<{
    inspection_id: number;
    inspection_date: string;
    odometer_km: number;
    overall_score: string;
    recommendation: string;
    status: string;
    summary: string;
    inspector_name: string;
  }>(
    `SELECT i.inspection_id, i.inspection_date, i.odometer_km, i.overall_score,
            i.recommendation, i.status, i.summary, u.full_name AS inspector_name
     FROM inspections i
     JOIN users u ON u.user_id = i.inspector_id
     WHERE i.vehicle_id = $1
     ORDER BY i.inspection_date DESC, i.inspection_id DESC`,
    [vehicleId],
  );

  const latestId = vehicle.latest_inspection_id;
  const checkpoints = latestId
    ? await query(
        `SELECT category, item_name, result, score, severity
         FROM inspection_checkpoints WHERE inspection_id = $1 ORDER BY checkpoint_id`,
        [latestId],
      )
    : [];
  const defects = latestId
    ? await query(
        `SELECT component, description, severity, repair_cost_estimate, affects_safety
         FROM defects WHERE inspection_id = $1 ORDER BY defect_id`,
        [latestId],
      )
    : [];
  const estimates = await query(
    `SELECT estimate_id, computed_at, estimated_value, gross_value, defect_penalty,
            age_years, age_factor, mileage_factor, condition_factor, assumptions, method_version
     FROM depreciation_estimates
     WHERE vehicle_id = $1
     ORDER BY computed_at DESC, estimate_id DESC
     LIMIT 6`,
    [vehicleId],
  );
  const sales = await query(
    `SELECT sale_id, model_year, odometer_km, sale_price, condition_score, city, sold_on, source
     FROM market_sales
     WHERE model_id = $1
     ORDER BY sold_on DESC`,
    [vehicle.model_id],
  );
  const audit = await query(
    `SELECT changed_at, old_data, new_data, changed_by
     FROM audit_log
     WHERE table_name = 'vehicles' AND record_id = $1
     ORDER BY changed_at DESC
     LIMIT 6`,
    [vehicleId],
  );

  const dossier = latestId ? await (await dossiers()).findOne({ sqlInspectionId: latestId }) : null;
  const similar = latestId ? (await searchCorpus(dossier?.narrative || vehicle.latest_summary || "", latestId)).vector : [];

  return { vehicle, inspections, checkpoints, defects, estimates, sales, audit, dossier, similar };
}
