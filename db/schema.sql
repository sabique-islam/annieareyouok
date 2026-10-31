-- UCDI: Used-Car Inspection, Condition & Depreciation Intelligence
-- PostgreSQL 17 + pgvector
--
-- This script rebuilds the ucdi database from scratch.
-- Run it only against the dedicated database named ucdi.
--
-- Demonstrates CREATE, ALTER, DROP, keys, checks, indexes, views,
-- functions, a stored procedure, triggers, full-text search, and
-- cosine similarity over embeddings.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  role_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE CHECK (role_name IN ('admin', 'inspector', 'buyer'))
);

CREATE TABLE users (
  user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 80),
  email TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  password_hash TEXT NOT NULL CHECK (password_hash ~ '^\$2[aby]\$'),
  role_id INTEGER NOT NULL REFERENCES roles (role_id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dealers (
  dealer_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 2 AND 60),
  license_no TEXT NOT NULL UNIQUE CHECK (char_length(license_no) BETWEEN 4 AND 30)
);

CREATE TABLE catalog_models (
  model_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  make TEXT NOT NULL CHECK (char_length(btrim(make)) BETWEEN 2 AND 40),
  model TEXT NOT NULL CHECK (char_length(btrim(model)) BETWEEN 1 AND 40),
  segment TEXT NOT NULL CHECK (segment IN ('hatch', 'sedan', 'suv', 'muv')),
  UNIQUE (make, model)
);

-- ---------------------------------------------------------------------------
-- Vehicles. The model-year bound is added afterwards with ALTER.
-- ---------------------------------------------------------------------------

CREATE TABLE vehicles (
  vehicle_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vin CHAR(17) NOT NULL UNIQUE CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  model_id INTEGER NOT NULL REFERENCES catalog_models (model_id),
  dealer_id INTEGER NOT NULL REFERENCES dealers (dealer_id),
  variant TEXT NOT NULL CHECK (char_length(btrim(variant)) BETWEEN 1 AND 40),
  model_year INTEGER NOT NULL,
  fuel_type TEXT NOT NULL CHECK (fuel_type IN ('petrol', 'diesel', 'cng', 'electric', 'hybrid')),
  transmission TEXT NOT NULL CHECK (transmission IN ('manual', 'automatic', 'amt', 'cvt', 'dct')),
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0 AND odometer_km <= 1000000),
  color TEXT NOT NULL CHECK (char_length(btrim(color)) BETWEEN 2 AND 30),
  registration_state TEXT NOT NULL CHECK (char_length(registration_state) BETWEEN 2 AND 30),
  owner_count INTEGER NOT NULL CHECK (owner_count BETWEEN 1 AND 12),
  accident_count INTEGER NOT NULL CHECK (accident_count BETWEEN 0 AND 20),
  list_price NUMERIC(12, 2) NOT NULL CHECK (list_price > 0),
  original_msrp NUMERIC(12, 2) NOT NULL CHECK (original_msrp > 0),
  condition_score NUMERIC(5, 1) CHECK (condition_score BETWEEN 0 AND 100),
  current_grade TEXT CHECK (current_grade IN ('A', 'B', 'C', 'D', 'F')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'under_inspection', 'sold', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_model_year_chk CHECK (model_year BETWEEN 1995 AND 2030);

CREATE INDEX idx_vehicles_model ON vehicles (model_id);
CREATE INDEX idx_vehicles_dealer ON vehicles (dealer_id);
CREATE INDEX idx_vehicles_status ON vehicles (status);
CREATE INDEX idx_vehicles_grade ON vehicles (current_grade);

-- Scratch relation used only to demonstrate ALTER and DROP.
CREATE TABLE load_staging (
  staging_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  raw_line TEXT NOT NULL
);
ALTER TABLE load_staging ADD COLUMN source_name TEXT;
DROP TABLE load_staging;

-- ---------------------------------------------------------------------------
-- Inspections, checkpoints, defects
-- ---------------------------------------------------------------------------

CREATE TABLE inspections (
  inspection_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles (vehicle_id) ON DELETE RESTRICT,
  inspector_id INTEGER NOT NULL REFERENCES users (user_id),
  inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0 AND odometer_km <= 1000000),
  overall_score NUMERIC(5, 1) NOT NULL DEFAULT 0 CHECK (overall_score BETWEEN 0 AND 100),
  recommendation TEXT NOT NULL CHECK (recommendation IN ('buy', 'negotiate', 'avoid')),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 20 AND 600),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'void')),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(summary, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspections_vehicle ON inspections (vehicle_id, inspection_date DESC, inspection_id DESC);
CREATE INDEX idx_inspections_inspector ON inspections (inspector_id);
CREATE INDEX idx_inspections_fts ON inspections USING GIN (search_vector);

CREATE TABLE inspection_checkpoints (
  checkpoint_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inspection_id INTEGER NOT NULL REFERENCES inspections (inspection_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'engine', 'transmission', 'brakes', 'suspension', 'electrical', 'body', 'interior', 'tyres', 'underbody'
  )),
  item_name TEXT NOT NULL CHECK (char_length(btrim(item_name)) BETWEEN 3 AND 80),
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'advisory', 'not_tested')),
  score NUMERIC(4, 1) NOT NULL CHECK (score BETWEEN 0 AND 10),
  severity TEXT NOT NULL CHECK (severity IN ('none', 'minor', 'moderate', 'major', 'critical')),
  UNIQUE (inspection_id, item_name)
);

CREATE INDEX idx_checkpoints_inspection ON inspection_checkpoints (inspection_id);

CREATE TABLE defects (
  defect_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inspection_id INTEGER NOT NULL REFERENCES inspections (inspection_id) ON DELETE CASCADE,
  checkpoint_id INTEGER REFERENCES inspection_checkpoints (checkpoint_id) ON DELETE SET NULL,
  component TEXT NOT NULL CHECK (char_length(btrim(component)) BETWEEN 2 AND 60),
  description TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 8 AND 400),
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
  repair_cost_estimate NUMERIC(12, 2) NOT NULL CHECK (repair_cost_estimate >= 0),
  affects_safety BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_defects_inspection ON defects (inspection_id);
CREATE INDEX idx_defects_severity ON defects (severity);

-- ---------------------------------------------------------------------------
-- Depreciation, embeddings, market comps, audit
-- ---------------------------------------------------------------------------

CREATE TABLE depreciation_estimates (
  estimate_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles (vehicle_id) ON DELETE CASCADE,
  inspection_id INTEGER REFERENCES inspections (inspection_id) ON DELETE SET NULL,
  computed_by INTEGER REFERENCES users (user_id) ON DELETE SET NULL,
  as_of_date DATE NOT NULL DEFAULT CURRENT_DATE,
  age_years INTEGER NOT NULL CHECK (age_years >= 0),
  age_factor NUMERIC(6, 4) NOT NULL CHECK (age_factor > 0 AND age_factor <= 1),
  mileage_factor NUMERIC(6, 4) NOT NULL CHECK (mileage_factor > 0),
  condition_factor NUMERIC(6, 4) NOT NULL CHECK (condition_factor > 0),
  gross_value NUMERIC(12, 2) NOT NULL CHECK (gross_value >= 0),
  defect_penalty NUMERIC(12, 2) NOT NULL CHECK (defect_penalty >= 0),
  estimated_value NUMERIC(12, 2) NOT NULL CHECK (estimated_value >= 0),
  method_version TEXT NOT NULL DEFAULT 'ucdi-residual-v1',
  assumptions TEXT NOT NULL CHECK (assumptions IN ('inspection', 'latest_completed', 'uninspected_prior')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_estimates_vehicle ON depreciation_estimates (vehicle_id, computed_at DESC);

-- 64-d embeddings of inspection narratives. Cosine distance: <=>
CREATE TABLE inspection_embeddings (
  embedding_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inspection_id INTEGER NOT NULL UNIQUE REFERENCES inspections (inspection_id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  embedding vector(64) NOT NULL,
  model_name TEXT NOT NULL CHECK (model_name <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embeddings_cosine
  ON inspection_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE market_sales (
  sale_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  model_id INTEGER NOT NULL REFERENCES catalog_models (model_id),
  model_year INTEGER NOT NULL CHECK (model_year BETWEEN 1995 AND 2030),
  odometer_km INTEGER NOT NULL CHECK (odometer_km >= 0),
  sale_price NUMERIC(12, 2) NOT NULL CHECK (sale_price > 0),
  condition_score NUMERIC(5, 1) CHECK (condition_score BETWEEN 0 AND 100),
  city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 2 AND 60),
  sold_on DATE NOT NULL,
  source TEXT NOT NULL CHECK (char_length(source) BETWEEN 2 AND 40)
);

CREATE INDEX idx_market_model ON market_sales (model_id, sold_on DESC);

CREATE TABLE audit_log (
  audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  changed_by INTEGER REFERENCES users (user_id) ON DELETE SET NULL,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_recent ON audit_log (changed_at DESC);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_grade_from_score(p_score NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_score >= 85 THEN 'A'
    WHEN p_score >= 70 THEN 'B'
    WHEN p_score >= 55 THEN 'C'
    WHEN p_score >= 40 THEN 'D'
    ELSE 'F'
  END;
$$;

COMMENT ON FUNCTION fn_grade_from_score IS
  'Maps a 0-100 condition score to a letter grade. A>=85, B>=70, C>=55, D>=40, else F.';

-- UCDI residual v1.
-- age 0 -> 0.96; else max(0.35, 0.88 * 0.94^(age-1))
-- mileage: 12,000 km/year expected; 2.5% per 10,000 km of excess, capped -25%/+8%
-- condition: 0.78 + 0.22 * score/100
-- defect penalty: actual repair sum, capped at 15% of gross
-- floor: 10% of MSRP
CREATE OR REPLACE FUNCTION fn_depreciation_breakdown(
  p_msrp NUMERIC,
  p_year INTEGER,
  p_odo INTEGER,
  p_score NUMERIC,
  p_defect_cost NUMERIC,
  p_as_of DATE
)
RETURNS TABLE (
  age_years INTEGER,
  age_factor NUMERIC,
  mileage_factor NUMERIC,
  condition_factor NUMERIC,
  gross_value NUMERIC,
  defect_penalty NUMERIC,
  estimated_value NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_age INTEGER;
  v_age_factor NUMERIC;
  v_delta NUMERIC;
  v_mileage_factor NUMERIC;
  v_condition_factor NUMERIC;
  v_score NUMERIC;
  v_gross NUMERIC;
  v_penalty NUMERIC;
  v_estimated NUMERIC;
BEGIN
  IF p_msrp IS NULL OR p_msrp <= 0 THEN
    RAISE EXCEPTION 'MSRP must be positive' USING ERRCODE = '23514';
  END IF;

  v_score := LEAST(100, GREATEST(0, COALESCE(p_score, 70)));
  v_age := EXTRACT(YEAR FROM p_as_of)::INTEGER - p_year;
  IF v_age < 0 THEN
    v_age := 0;
  END IF;

  IF v_age = 0 THEN
    v_age_factor := 0.96;
  ELSE
    v_age_factor := GREATEST(0.35, 0.88 * POWER(0.94, v_age - 1));
  END IF;

  v_delta := p_odo - (v_age * 12000);
  v_mileage_factor := 1 + GREATEST(-0.25, LEAST(0.08, -0.025 * (v_delta / 10000.0)));
  v_condition_factor := 0.78 + 0.22 * (v_score / 100.0);
  v_gross := ROUND(p_msrp * v_age_factor * v_mileage_factor * v_condition_factor, 0);
  v_penalty := ROUND(LEAST(GREATEST(COALESCE(p_defect_cost, 0), 0), v_gross * 0.15), 0);
  v_estimated := GREATEST(ROUND(v_gross - v_penalty, 0), ROUND(p_msrp * 0.10, 0));

  age_years := v_age;
  age_factor := ROUND(v_age_factor, 4);
  mileage_factor := ROUND(v_mileage_factor, 4);
  condition_factor := ROUND(v_condition_factor, 4);
  gross_value := v_gross;
  defect_penalty := v_penalty;
  estimated_value := v_estimated;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fn_depreciation_breakdown IS
  'UCDI residual v1. Returns age, mileage, and condition factors plus a defect-adjusted value.';

CREATE OR REPLACE FUNCTION fn_store_depreciation(
  p_vehicle_id INTEGER,
  p_user_id INTEGER,
  p_inspection_id INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_msrp NUMERIC;
  v_year INTEGER;
  v_odo INTEGER;
  v_score NUMERIC;
  v_vehicle_score NUMERIC;
  v_defects NUMERIC;
  v_note TEXT;
  v_row RECORD;
  v_id INTEGER;
BEGIN
  SELECT original_msrp, model_year, odometer_km, condition_score
    INTO v_msrp, v_year, v_odo, v_vehicle_score
  FROM vehicles
  WHERE vehicle_id = p_vehicle_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id USING ERRCODE = '23503';
  END IF;

  IF p_inspection_id IS NOT NULL THEN
    SELECT overall_score INTO v_score
    FROM inspections
    WHERE inspection_id = p_inspection_id
      AND vehicle_id = p_vehicle_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inspection % does not belong to vehicle %', p_inspection_id, p_vehicle_id
        USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(SUM(repair_cost_estimate), 0) INTO v_defects
    FROM defects
    WHERE inspection_id = p_inspection_id;
    v_note := 'inspection';
  ELSE
    SELECT i.overall_score, COALESCE(SUM(d.repair_cost_estimate), 0)
      INTO v_score, v_defects
    FROM inspections i
    LEFT JOIN defects d ON d.inspection_id = i.inspection_id
    WHERE i.vehicle_id = p_vehicle_id
      AND i.status = 'completed'
      AND i.inspection_id = (
        SELECT inspection_id
        FROM inspections
        WHERE vehicle_id = p_vehicle_id AND status = 'completed'
        ORDER BY inspection_date DESC, inspection_id DESC
        LIMIT 1
      )
    GROUP BY i.overall_score;

    IF v_score IS NULL THEN
      v_score := COALESCE(v_vehicle_score, 70);
      v_defects := 0;
      v_note := 'uninspected_prior';
    ELSE
      v_note := 'latest_completed';
    END IF;
  END IF;

  SELECT * INTO v_row
  FROM fn_depreciation_breakdown(
    v_msrp, v_year, v_odo, v_score, COALESCE(v_defects, 0), CURRENT_DATE
  );

  INSERT INTO depreciation_estimates (
    vehicle_id, inspection_id, computed_by, as_of_date,
    age_years, age_factor, mileage_factor, condition_factor,
    gross_value, defect_penalty, estimated_value, assumptions
  ) VALUES (
    p_vehicle_id, p_inspection_id, p_user_id, CURRENT_DATE,
    v_row.age_years, v_row.age_factor, v_row.mileage_factor, v_row.condition_factor,
    v_row.gross_value, v_row.defect_penalty, v_row.estimated_value, v_note
  )
  RETURNING estimate_id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_record_depreciation(
  p_vehicle_id INTEGER,
  p_user_id INTEGER,
  p_inspection_id INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM fn_store_depreciation(p_vehicle_id, p_user_id, p_inspection_id);
END;
$$;

COMMENT ON PROCEDURE sp_record_depreciation IS
  'Stores a residual snapshot. The caller owns the transaction; this procedure does not commit.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_users_before()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_other_admins INTEGER;
  v_is_admin BOOLEAN;
BEGIN
  NEW.email := lower(btrim(NEW.email));

  IF TG_OP = 'UPDATE' AND OLD.is_active AND NOT NEW.is_active THEN
    SELECT EXISTS (
      SELECT 1 FROM roles r WHERE r.role_id = OLD.role_id AND r.role_name = 'admin'
    ) INTO v_is_admin;

    IF v_is_admin THEN
      SELECT COUNT(*) INTO v_other_admins
      FROM users u
      JOIN roles r ON r.role_id = u.role_id
      WHERE r.role_name = 'admin'
        AND u.is_active
        AND u.user_id <> OLD.user_id;
      IF v_other_admins = 0 THEN
        RAISE EXCEPTION 'The last active admin cannot be deactivated' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER users_before
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION trg_users_before();

CREATE OR REPLACE FUNCTION trg_vehicles_before()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.odometer_km < OLD.odometer_km THEN
    RAISE EXCEPTION 'Odometer cannot decrease (% km recorded, % km submitted)',
      OLD.odometer_km, NEW.odometer_km
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := NOW();

  IF TG_OP = 'UPDATE' AND (
    NEW.list_price IS DISTINCT FROM OLD.list_price OR
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.condition_score IS DISTINCT FROM OLD.condition_score OR
    NEW.odometer_km IS DISTINCT FROM OLD.odometer_km OR
    NEW.current_grade IS DISTINCT FROM OLD.current_grade
  ) THEN
    v_user := NULLIF(current_setting('ucdi.user_id', true), '');
    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_data, new_data)
    VALUES (
      'vehicles',
      NEW.vehicle_id,
      'UPDATE',
      CASE WHEN v_user IS NULL THEN NULL ELSE v_user::INTEGER END,
      jsonb_build_object(
        'list_price', OLD.list_price,
        'status', OLD.status,
        'condition_score', OLD.condition_score,
        'odometer_km', OLD.odometer_km,
        'current_grade', OLD.current_grade
      ),
      jsonb_build_object(
        'list_price', NEW.list_price,
        'status', NEW.status,
        'condition_score', NEW.condition_score,
        'odometer_km', NEW.odometer_km,
        'current_grade', NEW.current_grade
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER vehicles_before
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION trg_vehicles_before();

CREATE OR REPLACE FUNCTION trg_checkpoint_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.result = 'fail' AND NEW.severity = 'none' THEN
    RAISE EXCEPTION 'A failed checkpoint cannot have severity none' USING ERRCODE = '23514';
  END IF;
  IF NEW.result = 'pass' AND NEW.severity IN ('major', 'critical') THEN
    RAISE EXCEPTION 'A passed checkpoint cannot be major or critical' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER checkpoint_rules
  BEFORE INSERT OR UPDATE ON inspection_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION trg_checkpoint_rules();

CREATE OR REPLACE FUNCTION trg_inspection_odometer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_odo INTEGER;
BEGIN
  SELECT odometer_km INTO v_odo FROM vehicles WHERE vehicle_id = NEW.vehicle_id;
  IF NEW.odometer_km < v_odo THEN
    RAISE EXCEPTION 'Inspection odometer % km is below the recorded odometer % km',
      NEW.odometer_km, v_odo
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inspection_odometer
  BEFORE INSERT OR UPDATE OF odometer_km, vehicle_id ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION trg_inspection_odometer();

CREATE OR REPLACE FUNCTION trg_sync_vehicle_condition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_score NUMERIC;
  v_odo INTEGER;
BEGIN
  IF NEW.status = 'completed' AND (
    TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed' OR NEW.overall_score IS DISTINCT FROM OLD.overall_score
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM inspections
      WHERE vehicle_id = NEW.vehicle_id
        AND status = 'completed'
        AND inspection_id <> NEW.inspection_id
        AND (inspection_date, inspection_id) > (NEW.inspection_date, NEW.inspection_id)
    ) THEN
      UPDATE vehicles
      SET condition_score = NEW.overall_score,
          current_grade = fn_grade_from_score(NEW.overall_score),
          odometer_km = GREATEST(odometer_km, NEW.odometer_km),
          status = CASE WHEN status = 'under_inspection' THEN 'available' ELSE status END
      WHERE vehicle_id = NEW.vehicle_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'void' THEN
    SELECT overall_score, odometer_km
      INTO v_score, v_odo
    FROM inspections
    WHERE vehicle_id = NEW.vehicle_id
      AND status = 'completed'
    ORDER BY inspection_date DESC, inspection_id DESC
    LIMIT 1;

    UPDATE vehicles
    SET condition_score = v_score,
        current_grade = CASE WHEN v_score IS NULL THEN NULL ELSE fn_grade_from_score(v_score) END
    WHERE vehicle_id = NEW.vehicle_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_vehicle_condition
  AFTER INSERT OR UPDATE OF status, overall_score ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION trg_sync_vehicle_condition();

CREATE OR REPLACE FUNCTION trg_block_completed_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Completed inspections cannot be deleted; void them instead' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER block_completed_delete
  BEFORE DELETE ON inspections
  FOR EACH ROW
  EXECUTE FUNCTION trg_block_completed_delete();

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

CREATE VIEW vw_fleet_intelligence AS
SELECT
  v.vehicle_id,
  v.vin,
  cm.make,
  cm.model,
  cm.segment,
  cm.model_id,
  v.variant,
  v.model_year,
  v.odometer_km,
  v.list_price,
  v.original_msrp,
  v.condition_score,
  v.current_grade,
  v.status,
  v.fuel_type,
  v.transmission,
  v.color,
  v.registration_state,
  v.owner_count,
  v.accident_count,
  v.dealer_id,
  d.name AS dealer_name,
  d.city AS dealer_city,
  i.inspection_id AS latest_inspection_id,
  i.inspection_date AS latest_inspection_date,
  i.recommendation,
  i.summary AS latest_summary,
  i.overall_score AS latest_score,
  e.estimate_id,
  e.estimated_value,
  e.gross_value,
  e.defect_penalty,
  e.age_factor,
  e.mileage_factor,
  e.condition_factor,
  e.age_years,
  e.method_version,
  e.assumptions,
  CASE
    WHEN e.estimated_value IS NULL THEN 'unpriced'
    WHEN v.list_price > e.estimated_value * 1.08 THEN 'overpriced'
    WHEN v.list_price < e.estimated_value * 0.92 THEN 'underpriced'
    ELSE 'fair'
  END AS price_signal,
  CASE
    WHEN e.estimated_value IS NULL THEN NULL
    ELSE v.list_price - e.estimated_value
  END AS price_gap
FROM vehicles v
JOIN catalog_models cm ON cm.model_id = v.model_id
JOIN dealers d ON d.dealer_id = v.dealer_id
LEFT JOIN LATERAL (
  SELECT inspection_id, inspection_date, recommendation, summary, overall_score
  FROM inspections
  WHERE vehicle_id = v.vehicle_id AND status = 'completed'
  ORDER BY inspection_date DESC, inspection_id DESC
  LIMIT 1
) i ON TRUE
LEFT JOIN LATERAL (
  SELECT
    estimate_id, estimated_value, gross_value, defect_penalty,
    age_factor, mileage_factor, condition_factor, age_years,
    method_version, assumptions
  FROM depreciation_estimates
  WHERE vehicle_id = v.vehicle_id
  ORDER BY computed_at DESC, estimate_id DESC
  LIMIT 1
) e ON TRUE;

COMMENT ON VIEW vw_fleet_intelligence IS
  'One row per vehicle: latest completed inspection, latest residual, and ask-versus-model signal. Over 8% high is overpriced, under 8% low is underpriced.';

CREATE VIEW vw_inspector_load AS
SELECT
  u.user_id,
  u.full_name,
  COUNT(i.inspection_id) FILTER (WHERE i.status = 'completed') AS completed_inspections,
  ROUND(AVG(i.overall_score) FILTER (WHERE i.status = 'completed'), 1) AS avg_score,
  COUNT(i.inspection_id) FILTER (WHERE i.inspection_date >= CURRENT_DATE - 30) AS last_30_days
FROM users u
JOIN roles r ON r.role_id = u.role_id AND r.role_name = 'inspector'
LEFT JOIN inspections i ON i.inspector_id = u.user_id
GROUP BY u.user_id, u.full_name;

COMMENT ON VIEW vw_inspector_load IS
  'Completed inspection counts and average scores by inspector.';

-- ---------------------------------------------------------------------------
-- Privileges for the application role, when that role exists
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  obj record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ucdi') THEN
    RETURN;
  END IF;

  GRANT USAGE ON SCHEMA public TO ucdi;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ucdi;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ucdi;
  GRANT USAGE ON TYPE vector TO ucdi;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ucdi;
  GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO ucdi;

  FOR obj IN
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'S')
  LOOP
    IF obj.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO ucdi', obj.nspname, obj.relname);
    ELSIF obj.relkind = 'v' THEN
      EXECUTE format('ALTER VIEW %I.%I OWNER TO ucdi', obj.nspname, obj.relname);
    ELSE
      EXECUTE format('ALTER TABLE %I.%I OWNER TO ucdi', obj.nspname, obj.relname);
    END IF;
  END LOOP;

  FOR obj IN
    SELECT p.oid::regprocedure AS signature, p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    IF obj.prokind = 'p' THEN
      EXECUTE format('ALTER PROCEDURE %s OWNER TO ucdi', obj.signature);
    ELSE
      EXECUTE format('ALTER FUNCTION %s OWNER TO ucdi', obj.signature);
    END IF;
  END LOOP;
END $$;
