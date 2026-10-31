import { EMBEDDING_MODEL, embed, toSqlVector } from "../search/embedding.mjs";
import { pool, query } from "../db/postgres";
import { dossiers, type Dossier } from "../db/mongo";

export type InspectionInput = {
  vehicleId: number;
  odometerKm: number;
  summary: string;
  narrative: string;
  recommendation: string;
  environment: { city: string; weather: string; lighting: string };
  checkpoints: {
    category: string;
    itemName: string;
    result: string;
    score: number;
    severity: string;
  }[];
  defects: {
    component: string;
    description: string;
    severity: string;
    repairCost: number;
    affectsSafety: boolean;
    itemName?: string;
  }[];
};

export async function completeInspection(input: InspectionInput, userId: number) {
  const client = await pool.connect();
  let inspectionId = 0;
  let vin = "";
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(userId)]);

    const vehicle = await client.query<{ vin: string; odometer_km: number }>(
      `SELECT vin, odometer_km FROM vehicles WHERE vehicle_id = $1 FOR UPDATE`,
      [input.vehicleId],
    );
    if (!vehicle.rows[0]) {
      throw Object.assign(new Error("Vehicle not found."), { code: "23503" });
    }
    vin = vehicle.rows[0].vin;
    if (input.odometerKm < vehicle.rows[0].odometer_km) {
      throw Object.assign(
        new Error(
          `Inspection odometer ${input.odometerKm} km is below the recorded odometer ${vehicle.rows[0].odometer_km} km`,
        ),
        { code: "23514" },
      );
    }

    const inserted = await client.query<{ inspection_id: number }>(
      `INSERT INTO inspections (
         vehicle_id, inspector_id, inspection_date, odometer_km,
         overall_score, recommendation, summary, status
       ) VALUES ($1, $2, CURRENT_DATE, $3, 0, $4, $5, 'draft')
       RETURNING inspection_id`,
      [input.vehicleId, userId, input.odometerKm, input.recommendation, input.summary],
    );
    inspectionId = inserted.rows[0].inspection_id;

    for (const row of input.checkpoints) {
      await client.query(
        `INSERT INTO inspection_checkpoints (inspection_id, category, item_name, result, score, severity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [inspectionId, row.category, row.itemName, row.result, row.score, row.severity],
      );
    }

    for (const defect of input.defects) {
      await client.query(
        `INSERT INTO defects (
           inspection_id, checkpoint_id, component, description, severity, repair_cost_estimate, affects_safety
         ) VALUES (
           $1,
           (SELECT checkpoint_id FROM inspection_checkpoints
            WHERE inspection_id = $1 AND item_name = $2),
           $3, $4, $5, $6, $7
         )`,
        [
          inspectionId,
          defect.itemName ?? null,
          defect.component,
          defect.description,
          defect.severity,
          defect.repairCost,
          defect.affectsSafety,
        ],
      );
    }

    const scored = await client.query(
      `UPDATE inspections
       SET overall_score = scored.avg_score,
           status = 'completed'
       FROM (
         SELECT ROUND(AVG(score) * 10, 1) AS avg_score
         FROM inspection_checkpoints
         WHERE inspection_id = $1 AND result <> 'not_tested'
       ) scored
       WHERE inspections.inspection_id = $1
         AND scored.avg_score IS NOT NULL
       RETURNING overall_score`,
      [inspectionId],
    );
    if (scored.rowCount !== 1) {
      throw Object.assign(new Error("The inspection has no tested checkpoints."), { code: "23514" });
    }

    const sourceText = [input.narrative, ...input.defects.map((defect) => defect.description)].join("\n");
    await client.query(
      `INSERT INTO inspection_embeddings (inspection_id, source_text, embedding, model_name)
       VALUES ($1, $2, $3::vector, $4)`,
      [inspectionId, sourceText, toSqlVector(embed(sourceText)), EMBEDDING_MODEL],
    );

    await client.query(`SELECT fn_store_depreciation($1, $2, $3)`, [
      input.vehicleId,
      userId,
      inspectionId,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  let warning: string | null = null;
  try {
    const collection = await dossiers();
    const dossier: Dossier = {
      sqlInspectionId: inspectionId,
      vin,
      narrative: input.narrative,
      environment: input.environment,
      obdCodes: [],
      media: [],
      remarks: input.defects.map((defect) => defect.description),
      createdAt: new Date(),
    };
    await collection.insertOne(dossier);
  } catch (error) {
    console.error(error);
    warning = "The condition file was saved, but the MongoDB dossier could not be written.";
  }

  return { inspectionId, warning };
}

export async function voidInspection(inspectionId: number, userId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(userId)]);
    const updated = await client.query<{ vehicle_id: number }>(
      `UPDATE inspections
       SET status = 'void'
       WHERE inspection_id = $1 AND status = 'completed'
       RETURNING vehicle_id`,
      [inspectionId],
    );
    if (updated.rowCount !== 1) {
      throw Object.assign(new Error("Only a completed inspection can be voided."), { code: "23514" });
    }
    await client.query(`SELECT fn_store_depreciation($1, $2, NULL)`, [
      updated.rows[0].vehicle_id,
      userId,
    ]);
    await client.query("COMMIT");
    return updated.rows[0].vehicle_id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getInspection(inspectionId: number) {
  const rows = await query<{
    inspection_id: number;
    vehicle_id: number;
    vin: string;
    make: string;
    model: string;
    variant: string;
    model_year: number;
    inspection_date: string;
    odometer_km: number;
    overall_score: string;
    recommendation: string;
    summary: string;
    status: string;
    inspector_name: string;
  }>(
    `SELECT i.inspection_id, i.vehicle_id, v.vin, cm.make, cm.model, v.variant, v.model_year,
            i.inspection_date, i.odometer_km, i.overall_score, i.recommendation,
            i.summary, i.status, u.full_name AS inspector_name
     FROM inspections i
     JOIN vehicles v ON v.vehicle_id = i.vehicle_id
     JOIN catalog_models cm ON cm.model_id = v.model_id
     JOIN users u ON u.user_id = i.inspector_id
     WHERE i.inspection_id = $1`,
    [inspectionId],
  );
  if (!rows[0]) return null;

  const checkpoints = await query(
    `SELECT category, item_name, result, score, severity
     FROM inspection_checkpoints
     WHERE inspection_id = $1
     ORDER BY checkpoint_id`,
    [inspectionId],
  );
  const defects = await query(
    `SELECT component, description, severity, repair_cost_estimate, affects_safety
     FROM defects
     WHERE inspection_id = $1
     ORDER BY defect_id`,
    [inspectionId],
  );
  const collection = await dossiers();
  const dossier = await collection.findOne({ sqlInspectionId: inspectionId });
  return { inspection: rows[0], checkpoints, defects, dossier };
}
