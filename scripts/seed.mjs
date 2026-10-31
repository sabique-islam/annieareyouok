import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";
import pg from "pg";
import { CHECKPOINTS } from "../lib/inspections/checklist.mjs";
import { EMBEDDING_MODEL, embed, toSqlVector } from "../lib/search/embedding.mjs";
import { DEALERS, INSPECTIONS, MODELS, SALES, USERS, VEHICLES } from "./sample-data.mjs";

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

export async function seed() {
  for (const vehicle of VEHICLES) {
    if (!VIN.test(vehicle.vin)) {
      throw new Error(`Invalid sample VIN ${vehicle.vin}`);
    }
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  const dossiers = mongo.db().collection("inspection_dossiers");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      TRUNCATE TABLE
        audit_log,
        inspection_embeddings,
        depreciation_estimates,
        defects,
        inspection_checkpoints,
        inspections,
        market_sales,
        vehicles,
        catalog_models,
        dealers,
        users,
        roles
      RESTART IDENTITY CASCADE
    `);

    const roleIds = {};
    for (const role of ["admin", "inspector", "buyer"]) {
      const inserted = await client.query(
        `INSERT INTO roles (role_name) VALUES ($1) RETURNING role_id`,
        [role],
      );
      roleIds[role] = inserted.rows[0].role_id;
    }

    const userIds = {};
    for (const user of USERS) {
      const hash = bcrypt.hashSync(user.password, 10);
      const inserted = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role_id)
         VALUES ($1, $2, $3, $4) RETURNING user_id`,
        [user.fullName, user.email, hash, roleIds[user.role]],
      );
      userIds[user.email] = inserted.rows[0].user_id;
    }

    const dealerIds = {};
    for (const dealer of DEALERS) {
      const inserted = await client.query(
        `INSERT INTO dealers (name, city, license_no) VALUES ($1, $2, $3) RETURNING dealer_id`,
        [dealer.name, dealer.city, dealer.licenseNo],
      );
      dealerIds[dealer.name] = inserted.rows[0].dealer_id;
    }

    const modelIds = {};
    for (const model of MODELS) {
      const inserted = await client.query(
        `INSERT INTO catalog_models (make, model, segment) VALUES ($1, $2, $3) RETURNING model_id`,
        [model.make, model.model, model.segment],
      );
      modelIds[`${model.make}|${model.model}`] = inserted.rows[0].model_id;
    }

    const vehicleIds = {};
    for (const vehicle of VEHICLES) {
      const firstOdometer = INSPECTIONS
        .filter((inspection) => inspection.vin === vehicle.vin)
        .map((inspection) => inspection.odometerKm)
        .sort((a, b) => a - b)[0] ?? vehicle.odometerKm;
      const inserted = await client.query(
        `INSERT INTO vehicles (
           vin, model_id, dealer_id, variant, model_year, fuel_type, transmission,
           odometer_km, color, registration_state, owner_count, accident_count,
           list_price, original_msrp, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING vehicle_id`,
        [
          vehicle.vin,
          modelIds[`${vehicle.make}|${vehicle.model}`],
          dealerIds[vehicle.dealer],
          vehicle.variant,
          vehicle.modelYear,
          vehicle.fuelType,
          vehicle.transmission,
          firstOdometer,
          vehicle.color,
          vehicle.registrationState,
          vehicle.ownerCount,
          vehicle.accidentCount,
          vehicle.listPrice ?? vehicle.originalMsrp,
          vehicle.originalMsrp,
          vehicle.status,
        ],
      );
      vehicleIds[vehicle.vin] = inserted.rows[0].vehicle_id;
    }

    const adminId = userIds[USERS.find((user) => user.role === "admin").email];
    await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(adminId)]);

    const ordered = [...INSPECTIONS].sort((a, b) => a.date.localeCompare(b.date) || a.vin.localeCompare(b.vin));
    const filed = [];
    for (const inspection of ordered) {
      const inspectorId = userIds[inspection.inspector];
      await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(inspectorId)]);
      const inserted = await client.query(
        `INSERT INTO inspections (
           vehicle_id, inspector_id, inspection_date, odometer_km,
           overall_score, recommendation, summary, status
         ) VALUES ($1, $2, $3, $4, 0, $5, $6, 'draft')
         RETURNING inspection_id`,
        [
          vehicleIds[inspection.vin],
          inspectorId,
          inspection.date,
          inspection.odometerKm,
          inspection.recommendation,
          inspection.summary,
        ],
      );
      const inspectionId = inserted.rows[0].inspection_id;
      for (const item of CHECKPOINTS) {
        const override = inspection.overrides[item.itemName];
        const row = override ?? { result: "pass", score: inspection.passScore, severity: "none" };
        await client.query(
          `INSERT INTO inspection_checkpoints (inspection_id, category, item_name, result, score, severity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [inspectionId, item.category, item.itemName, row.result, row.score, row.severity],
        );
      }
      for (const defect of inspection.defects) {
        await client.query(
          `INSERT INTO defects (
             inspection_id, checkpoint_id, component, description, severity, repair_cost_estimate, affects_safety
           ) VALUES (
             $1,
             (SELECT checkpoint_id FROM inspection_checkpoints WHERE inspection_id = $1 AND item_name = $2),
             $3, $4, $5, $6, $7
           )`,
          [
            inspectionId,
            defect.itemName,
            defect.component,
            defect.description,
            defect.severity,
            defect.repairCost,
            defect.affectsSafety,
          ],
        );
      }
      await client.query(
        `UPDATE inspections
         SET overall_score = scored.avg_score, status = 'completed'
         FROM (
           SELECT ROUND(AVG(score) * 10, 1) AS avg_score
           FROM inspection_checkpoints
           WHERE inspection_id = $1 AND result <> 'not_tested'
         ) scored
         WHERE inspections.inspection_id = $1`,
        [inspectionId],
      );
      const sourceText = [inspection.narrative, ...inspection.defects.map((defect) => defect.description)].join("\n");
      await client.query(
        `INSERT INTO inspection_embeddings (inspection_id, source_text, embedding, model_name)
         VALUES ($1, $2, $3::vector, $4)`,
        [inspectionId, sourceText, toSqlVector(embed(sourceText)), EMBEDDING_MODEL],
      );
      await client.query(`SELECT fn_store_depreciation($1, $2, $3)`, [
        vehicleIds[inspection.vin],
        inspectorId,
        inspectionId,
      ]);
      filed.push({ ...inspection, inspectionId, sourceText });
    }

    await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(adminId)]);
    for (const vehicle of VEHICLES) {
      const vehicleId = vehicleIds[vehicle.vin];
      if (vehicle.askFactor) {
        const estimate = await client.query(
          `SELECT estimated_value
           FROM depreciation_estimates
           WHERE vehicle_id = $1
           ORDER BY estimate_id DESC
           LIMIT 1`,
          [vehicleId],
        );
        const ask = Math.round(Number(estimate.rows[0].estimated_value) * vehicle.askFactor);
        await client.query(`UPDATE vehicles SET list_price = $2 WHERE vehicle_id = $1`, [vehicleId, ask]);
      }
      if (vehicle.finalStatus) {
        await client.query(`UPDATE vehicles SET status = $2 WHERE vehicle_id = $1`, [vehicleId, vehicle.finalStatus]);
      }
    }

    for (const sale of SALES) {
      await client.query(
        `INSERT INTO market_sales (
           model_id, model_year, odometer_km, sale_price, condition_score, city, sold_on, source
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          modelIds[`${sale.make}|${sale.model}`],
          sale.modelYear,
          sale.odometerKm,
          sale.salePrice,
          sale.conditionScore,
          sale.city,
          sale.soldOn,
          sale.source,
        ],
      );
    }

    await client.query("COMMIT");

    await dossiers.deleteMany({});
    await dossiers.createIndex({ sqlInspectionId: 1 }, { unique: true });
    await dossiers.createIndex({ vin: 1 });
    await dossiers.createIndex({ "environment.city": 1 });
    await dossiers.createIndex({ narrative: "text" });
    await dossiers.insertMany(
      filed.map((inspection) => ({
        sqlInspectionId: inspection.inspectionId,
        vin: inspection.vin,
        narrative: inspection.narrative,
        environment: inspection.environment,
        obdCodes: inspection.obdCodes,
        media: inspection.media,
        remarks: inspection.remarks,
        createdAt: new Date(inspection.date),
      })),
    );

    const priced = await pool.query(
      `SELECT vin, make, model, current_grade, list_price, estimated_value, price_signal
       FROM vw_fleet_intelligence
       ORDER BY make, model`,
    );
    console.table(priced.rows.map((row) => ({
      vin: row.vin,
      car: `${row.make} ${row.model}`,
      grade: row.current_grade,
      ask: Number(row.list_price),
      residual: row.estimated_value === null ? null : Number(row.estimated_value),
      signal: row.price_signal,
    })));
    console.log(`Seeded ${filed.length} inspections and ${SALES.length} recorded sales.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
    await mongo.close();
  }
}

const isDirect = process.argv[1] && process.argv[1].endsWith("seed.mjs");
if (isDirect) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
