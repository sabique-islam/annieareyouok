import { mkdirSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";
import pg from "pg";
import { embed, cosine } from "../lib/search/embedding.mjs";
import { demoUsers } from "../lib/auth/accounts.mjs";
import { INSPECTIONS } from "./sample-data.mjs";

const admin = demoUsers().find((user) => user.role === "admin");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function expectError(name, fn, includes) {
  try {
    await fn();
    record(name, false, "expected the database to reject this");
  } catch (error) {
    const message = String(error.message || error);
    const ok = includes ? message.toLowerCase().includes(includes.toLowerCase()) : true;
    record(name, ok, ok ? message.split("\n")[0] : message.split("\n")[0]);
  }
}

const city = INSPECTIONS.find((item) => item.vin.startsWith("MAHC1TY") && item.date === "2026-10-18");
const creta = INSPECTIONS.find((item) => item.vin.startsWith("MAHYCR"));
const seltos = INSPECTIONS.find((item) => item.vin.startsWith("MAKSEL"));
const corrosionQuery = "hidden corrosion inside the cabin";
const cityScore = cosine(embed(corrosionQuery), embed(`${city.narrative}\n${city.defects.map((d) => d.description).join("\n")}`));
const seltosScore = cosine(embed(corrosionQuery), embed(seltos.narrative));
record(
  "Embedding ranks cabin rust above a clean car",
  cityScore > seltosScore,
  `city ${cityScore.toFixed(3)} vs seltos ${seltosScore.toFixed(3)}`,
);

await expectError("Rejects a VIN containing I", async () => {
  await pool.query(
    `INSERT INTO vehicles (
       vin, model_id, dealer_id, variant, model_year, fuel_type, transmission,
       odometer_km, color, registration_state, owner_count, accident_count,
       list_price, original_msrp
     )
     SELECT 'MAHINVAL1D1234567', model_id, dealer_id, variant, model_year, fuel_type, transmission,
            odometer_km, color, registration_state, owner_count, accident_count, list_price, original_msrp
     FROM vehicles LIMIT 1`,
  );
}, "check");

await expectError("Rejects an odometer decrease", async () => {
  await pool.query(`UPDATE vehicles SET odometer_km = odometer_km - 1 WHERE vin = 'MAHC1TY19K1234501'`);
}, "cannot decrease");

await expectError("Rejects a failed checkpoint with no severity", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inspection = await client.query(`SELECT inspection_id FROM inspections WHERE status = 'completed' LIMIT 1`);
    await client.query(
      `INSERT INTO inspection_checkpoints (inspection_id, category, item_name, result, score, severity)
       VALUES ($1, 'engine', 'Temporary probe', 'fail', 2, 'none')`,
      [inspection.rows[0].inspection_id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}, "severity");

await expectError("Refuses to delete a completed inspection", async () => {
  await pool.query(`DELETE FROM inspections WHERE status = 'completed' AND inspection_id = (SELECT MIN(inspection_id) FROM inspections WHERE status = 'completed')`);
}, "void");

await expectError("Refuses to deactivate the last admin", async () => {
  await pool.query(
    `UPDATE users SET is_active = FALSE
     WHERE email = $1`,
    [admin.email],
  );
}, "last active admin");

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const before = await client.query(`SELECT COUNT(*)::int AS n FROM users`);
  try {
    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role_id)
       VALUES ('Bad Hash', 'bad@ucdi.test', 'plaintext', (SELECT role_id FROM roles WHERE role_name = 'buyer'))`,
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
  }
  const after = await client.query(`SELECT COUNT(*)::int AS n FROM users`);
  record("Rolled-back insert does not keep the bad user", before.rows[0].n === after.rows[0].n, `${before.rows[0].n} users`);
} finally {
  client.release();
}

const signals = await pool.query(
  `SELECT price_signal, COUNT(*)::int AS n FROM vw_fleet_intelligence GROUP BY price_signal ORDER BY price_signal`,
);
const present = new Set(signals.rows.map((row) => row.price_signal));
record(
  "Fleet view has high, low, fair, and unpriced asks",
  ["overpriced", "underpriced", "fair", "unpriced"].every((signal) => present.has(signal)),
  signals.rows.map((row) => `${row.price_signal}:${row.n}`).join(", "),
);

const vector = await pool.query(
  `SELECT cm.model, 1 - (e.embedding <=> $1::vector) AS similarity
   FROM inspection_embeddings e
   JOIN inspections i ON i.inspection_id = e.inspection_id AND i.status = 'completed'
   JOIN vehicles v ON v.vehicle_id = i.vehicle_id
   JOIN catalog_models cm ON cm.model_id = v.model_id
   ORDER BY e.embedding <=> $1::vector
   LIMIT 3`,
  [`[${embed(corrosionQuery).map((n) => n.toFixed(6)).join(",")}]`],
);
record(
  "Vector search leads with the City for a corrosion paraphrase",
  vector.rows[0]?.model === "City",
  vector.rows.map((row) => `${row.model} ${Number(row.similarity).toFixed(3)}`).join(", "),
);

const fts = await pool.query(
  `SELECT cm.model
   FROM inspections i
   JOIN vehicles v ON v.vehicle_id = i.vehicle_id
   JOIN catalog_models cm ON cm.model_id = v.model_id
   WHERE i.search_vector @@ plainto_tsquery('english', $1)`,
  [corrosionQuery],
);
record("Full-text misses the corrosion paraphrase", fts.rowCount === 0, `${fts.rowCount} hits`);

const damp = await pool.query(
  `SELECT cm.model
   FROM inspections i
   JOIN vehicles v ON v.vehicle_id = i.vehicle_id
   JOIN catalog_models cm ON cm.model_id = v.model_id
   WHERE i.search_vector @@ plainto_tsquery('english', 'damp footwell')`,
);
record("Full-text finds damp footwell on the City summary", damp.rows.some((row) => row.model === "City"), damp.rows.map((row) => row.model).join(", "));

const repairs = await pool.query(
  `SELECT cm.make, SUM(df.repair_cost_estimate) AS repair_total
   FROM defects df
   JOIN inspections i ON i.inspection_id = df.inspection_id
   JOIN vehicles v ON v.vehicle_id = i.vehicle_id
   JOIN catalog_models cm ON cm.model_id = v.model_id
   GROUP BY cm.make
   HAVING SUM(df.repair_cost_estimate) > 20000`,
);
record("HAVING keeps makes above the repair threshold", repairs.rowCount >= 2, `${repairs.rowCount} makes`);

const hashes = await pool.query(`SELECT email, password_hash FROM users`);
record(
  "Passwords are bcrypt hashes",
  hashes.rows.every((row) => row.password_hash.startsWith("$2") && row.password_hash !== admin.password)
    && bcrypt.compareSync(admin.password, hashes.rows.find((row) => row.email === admin.email).password_hash),
  `${hashes.rowCount} accounts`,
);

const grade = await pool.query(
  `SELECT fn_grade_from_score(85) AS a, fn_grade_from_score(70) AS b, fn_grade_from_score(39) AS f`,
);
record("Grade function boundaries", grade.rows[0].a === "A" && grade.rows[0].b === "B" && grade.rows[0].f === "F", JSON.stringify(grade.rows[0]));

const procedure = await pool.connect();
try {
  await procedure.query("BEGIN");
  const ids = await procedure.query(
    `SELECT v.vehicle_id, u.user_id
     FROM vehicles v
     CROSS JOIN users u
     WHERE v.vin = 'MAHAMZ19KX1234509' AND u.email = $1`,
    [admin.email],
  );
  await procedure.query(`CALL sp_record_depreciation($1, $2, NULL)`, [
    ids.rows[0].vehicle_id,
    ids.rows[0].user_id,
  ]);
  const prior = await procedure.query(
    `SELECT de.assumptions
     FROM depreciation_estimates de
     JOIN vehicles v ON v.vehicle_id = de.vehicle_id
     WHERE v.vin = 'MAHAMZ19KX1234509'
     ORDER BY de.estimate_id DESC
     LIMIT 1`,
  );
  record(
    "Stored procedure records an uninspected residual",
    prior.rows[0]?.assumptions === "uninspected_prior",
    prior.rows[0]?.assumptions ?? "no row",
  );
  await procedure.query("ROLLBACK");
} finally {
  procedure.release();
}

const mongo = new MongoClient(process.env.MONGODB_URI);
await mongo.connect();
const collection = mongo.db().collection("inspection_dossiers");
const textHits = await collection.find({ $text: { $search: corrosionQuery } }).toArray();
record("Mongo text index misses the corrosion paraphrase", textHits.length === 0, `${textHits.length} hits`);
const grouped = await collection.aggregate([
  { $group: { _id: "$environment.city", n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
record("Mongo aggregation groups dossiers by city", grouped.length >= 2 && grouped.every((row) => row.n > 0), grouped.map((row) => `${row._id}:${row.n}`).join(", "));
const coldHits = await collection.find({ $text: { $search: "gearbox slipped cold" } }).toArray();
record(
  "Mongo text index finds the Creta narrative",
  coldHits.some((doc) => doc.vin === creta.vin),
  coldHits.map((doc) => doc.vin).join(", "),
);
await mongo.close();

const audits = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log`);
record("Audit trigger wrote vehicle history", audits.rows[0].n > 0, `${audits.rows[0].n} rows`);

const failed = results.filter((item) => !item.ok);
const markdown = [
  "# Test results",
  "",
  `Ran ${results.length} checks against the local PostgreSQL and MongoDB databases.`,
  "",
  "| Check | Result | Detail |",
  "| --- | --- | --- |",
  ...results.map((item) => `| ${item.name} | ${item.ok ? "Pass" : "Fail"} | ${item.detail.replaceAll("|", "/")} |`),
  "",
  failed.length === 0 ? "All checks passed." : `${failed.length} check(s) failed.`,
  "",
].join("\n");
mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/TEST_RESULTS.md", import.meta.url), markdown);
await pool.end();
if (failed.length) process.exit(1);
