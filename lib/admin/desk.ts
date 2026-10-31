import bcrypt from "bcryptjs";
import { pool, query } from "../db/postgres";
import { findQuery } from "../queries/named-queries";

export async function listUsers() {
  return query<{
    user_id: number;
    full_name: string;
    email: string;
    role_name: string;
    is_active: boolean;
    created_at: string;
  }>(
    `SELECT u.user_id, u.full_name, u.email, r.role_name, u.is_active, u.created_at
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     ORDER BY u.is_active DESC, r.role_name, u.full_name`,
  );
}

export async function createUser(input: {
  fullName: string;
  email: string;
  password: string;
  roleName: string;
}) {
  const hash = await bcrypt.hash(input.password, 10);
  const rows = await query<{ user_id: number }>(
    `INSERT INTO users (full_name, email, password_hash, role_id)
     VALUES ($1, $2, $3, (SELECT role_id FROM roles WHERE role_name = $4))
     RETURNING user_id`,
    [input.fullName, input.email, hash, input.roleName],
  );
  return rows[0].user_id;
}

export async function setUserActive(userId: number, isActive: boolean) {
  const rows = await query(
    `UPDATE users SET is_active = $2 WHERE user_id = $1 RETURNING user_id`,
    [userId, isActive],
  );
  return rows.length === 1;
}

export async function listMarket() {
  return query<{
    sale_id: number;
    make: string;
    model: string;
    model_id: number;
    model_year: number;
    odometer_km: number;
    sale_price: string;
    condition_score: string | null;
    city: string;
    sold_on: string;
    source: string;
  }>(
    `SELECT ms.sale_id, cm.make, cm.model, ms.model_id, ms.model_year, ms.odometer_km,
            ms.sale_price, ms.condition_score, ms.city, ms.sold_on, ms.source
     FROM market_sales ms
     JOIN catalog_models cm ON cm.model_id = ms.model_id
     ORDER BY ms.sold_on DESC, ms.sale_id DESC`,
  );
}

export async function createMarketSale(input: {
  modelId: number;
  modelYear: number;
  odometerKm: number;
  salePrice: number;
  conditionScore?: number | null;
  city: string;
  soldOn: string;
  source: string;
}) {
  const rows = await query<{ sale_id: number }>(
    `INSERT INTO market_sales (
       model_id, model_year, odometer_km, sale_price, condition_score, city, sold_on, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING sale_id`,
    [
      input.modelId,
      input.modelYear,
      input.odometerKm,
      input.salePrice,
      input.conditionScore ?? null,
      input.city,
      input.soldOn,
      input.source,
    ],
  );
  return rows[0].sale_id;
}

export async function deleteMarketSale(saleId: number) {
  const result = await pool.query(`DELETE FROM market_sales WHERE sale_id = $1`, [saleId]);
  return result.rowCount === 1;
}

export async function runNamedQuery(name: string) {
  const spec = findQuery(name);
  if (!spec) return null;
  const trimmed = spec.sql.trim().toLowerCase();
  if (!trimmed.startsWith("select") && !trimmed.startsWith("with")) {
    throw new Error("Only read queries are registered.");
  }
  const result = await pool.query(spec.sql);
  return {
    spec,
    columns: result.fields.map((field) => field.name),
    rows: result.rows as Record<string, unknown>[],
  };
}
