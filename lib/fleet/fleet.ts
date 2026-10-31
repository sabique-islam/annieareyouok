import { pool, query } from "../db/postgres";

export type FleetRow = {
  vehicle_id: number;
  vin: string;
  make: string;
  model: string;
  segment: string;
  model_id: number;
  variant: string;
  model_year: number;
  odometer_km: number;
  list_price: string;
  original_msrp: string;
  condition_score: string | null;
  current_grade: string | null;
  status: string;
  fuel_type: string;
  transmission: string;
  color: string;
  registration_state: string;
  owner_count: number;
  accident_count: number;
  dealer_id: number;
  dealer_name: string;
  dealer_city: string;
  latest_inspection_id: number | null;
  latest_inspection_date: string | null;
  recommendation: string | null;
  latest_summary: string | null;
  latest_score: string | null;
  estimate_id: number | null;
  estimated_value: string | null;
  gross_value: string | null;
  defect_penalty: string | null;
  age_factor: string | null;
  mileage_factor: string | null;
  condition_factor: string | null;
  age_years: number | null;
  method_version: string | null;
  assumptions: string | null;
  price_signal: string;
  price_gap: string | null;
};

export type FleetFilters = {
  make?: string;
  grade?: string;
  status?: string;
  q?: string;
};

export async function listFleet(filters: FleetFilters = {}) {
  const make = filters.make || null;
  const grade = filters.grade || null;
  const status = filters.status || null;
  const q = filters.q?.trim() || null;
  return query<FleetRow>(
    `SELECT * FROM vw_fleet_intelligence
     WHERE ($1::text IS NULL OR make = $1)
       AND ($2::text IS NULL OR current_grade = $2)
       AND ($3::text IS NULL OR status = $3)
       AND (
         $4::text IS NULL
         OR vin ILIKE '%' || $4 || '%'
         OR make ILIKE '%' || $4 || '%'
         OR model ILIKE '%' || $4 || '%'
         OR variant ILIKE '%' || $4 || '%'
       )
     ORDER BY make, model, model_year DESC`,
    [make, grade, status, q],
  );
}

export async function listMakes() {
  const rows = await query<{ make: string }>(
    `SELECT DISTINCT make FROM catalog_models ORDER BY make`,
  );
  return rows.map((row) => row.make);
}

export async function listCatalog() {
  return query<{ model_id: number; make: string; model: string; segment: string }>(
    `SELECT model_id, make, model, segment FROM catalog_models ORDER BY make, model`,
  );
}

export async function listDealers() {
  return query<{ dealer_id: number; name: string; city: string }>(
    `SELECT dealer_id, name, city FROM dealers ORDER BY name`,
  );
}

export async function createVehicle(
  input: {
    vin: string;
    modelId: number;
    dealerId: number;
    variant: string;
    modelYear: number;
    fuelType: string;
    transmission: string;
    odometerKm: number;
    color: string;
    registrationState: string;
    ownerCount: number;
    accidentCount: number;
    listPrice: number;
    originalMsrp: number;
    status: string;
  },
  userId: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(userId)]);
    const result = await client.query<{ vehicle_id: number }>(
      `INSERT INTO vehicles (
         vin, model_id, dealer_id, variant, model_year, fuel_type, transmission,
         odometer_km, color, registration_state, owner_count, accident_count,
         list_price, original_msrp, status
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
       ) RETURNING vehicle_id`,
      [
        input.vin,
        input.modelId,
        input.dealerId,
        input.variant,
        input.modelYear,
        input.fuelType,
        input.transmission,
        input.odometerKm,
        input.color,
        input.registrationState,
        input.ownerCount,
        input.accidentCount,
        input.listPrice,
        input.originalMsrp,
        input.status,
      ],
    );
    await client.query("COMMIT");
    return result.rows[0].vehicle_id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateListPrice(vehicleId: number, listPrice: number, userId: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('ucdi.user_id', $1, true)`, [String(userId)]);
    const result = await client.query(
      `UPDATE vehicles SET list_price = $2 WHERE vehicle_id = $1 RETURNING vehicle_id`,
      [vehicleId, listPrice],
    );
    await client.query("COMMIT");
    return result.rowCount === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
