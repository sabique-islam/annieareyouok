import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.local");
const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/postgresql@17/bin/psql";
const pgIsReady = process.env.PG_ISREADY_BIN || "/opt/homebrew/opt/postgresql@17/bin/pg_isready";
const pgCtl = process.env.PG_CTL_BIN || "/opt/homebrew/opt/postgresql@17/bin/pg_ctl";
const pgData = process.env.PG_DATA || "/opt/homebrew/var/postgresql@17";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const SECRET_KEYS = [
  "AUTH_SECRET",
  "POSTGRES_PASSWORD",
  "DEMO_ADMIN_PASSWORD",
  "DEMO_INSPECTOR_PASSWORD",
  "DEMO_FIELD_PASSWORD",
  "DEMO_BUYER_PASSWORD",
];

function parseEnv(text) {
  const entries = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      entries.push({ raw: line });
      continue;
    }
    const eq = trimmed.indexOf("=");
    entries.push({ raw: line, key: trimmed.slice(0, eq), value: trimmed.slice(eq + 1) });
  }
  return entries;
}

function ensureEnv() {
  if (!existsSync(envFile)) {
    writeFileSync(envFile, readFileSync(join(root, ".env.example"), "utf8"));
    console.log("Wrote .env.local from .env.example");
  }
  const entries = parseEnv(readFileSync(envFile, "utf8"));
  const values = new Map(entries.filter((entry) => entry.key).map((entry) => [entry.key, entry.value]));
  let changed = false;
  for (const key of SECRET_KEYS) {
    if (values.get(key)) continue;
    const generated = key === "AUTH_SECRET" ? randomBytes(32).toString("hex") : randomBytes(18).toString("base64url");
    values.set(key, generated);
    const existing = entries.find((entry) => entry.key === key);
    if (existing) existing.value = generated;
    else entries.push({ key, value: generated });
    changed = true;
  }
  if (!values.get("DATABASE_URL")) {
    const user = values.get("POSTGRES_USER");
    const database = values.get("POSTGRES_DB");
    const password = values.get("POSTGRES_PASSWORD");
    const host = values.get("PGHOST");
    const port = values.get("PGPORT");
    if (!user || !database || !password || !host || !port) {
      throw new Error("Set PGHOST, PGPORT, POSTGRES_USER, POSTGRES_DB, and POSTGRES_PASSWORD before setup.");
    }
    const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
    values.set("DATABASE_URL", url);
    const existing = entries.find((entry) => entry.key === "DATABASE_URL");
    if (existing) existing.value = url;
    else entries.push({ key: "DATABASE_URL", value: url });
    changed = true;
  }
  if (changed) {
    const encode = (value) => (/[\s#"'\\]/.test(value) ? `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"` : value);
    const body = entries
      .map((entry) => (entry.key ? `${entry.key}=${encode(entry.value)}` : entry.raw))
      .join("\n");
    writeFileSync(envFile, body.endsWith("\n") ? body : `${body}\n`);
  }
  loadEnv(envFile);
  for (const key of ["DATABASE_URL", "MONGODB_URI", "AUTH_SECRET", "SESSION_COOKIE", ...SECRET_KEYS.slice(1)]) {
    if (!process.env[key]) throw new Error(`${key} is not set.`);
  }
}

function ensurePostgres() {
  try {
    execSync(`${pgIsReady} -h 127.0.0.1 -p 5432`, { stdio: "ignore" });
    return;
  } catch {
    console.log("PostgreSQL is not accepting connections. Starting PostgreSQL 17…");
  }
  execSync(`${pgCtl} -D ${pgData} -l /tmp/ucdi-postgresql17.log start`, { stdio: "inherit" });
  execSync(`${pgIsReady} -h 127.0.0.1 -p 5432`, { stdio: "ignore" });
}

function sqlQuote(value) {
  return value.replaceAll("'", "''");
}

function ensureRoleAndDatabase() {
  const url = new URL(process.env.DATABASE_URL);
  const database = url.pathname.replace(/^\//, "");
  const role = decodeURIComponent(url.username);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(role) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
    throw new Error("DATABASE_URL username and database must be plain identifiers.");
  }
  const password = decodeURIComponent(url.password);
  const roleFile = join(root, "db/.role.sql");
  writeFileSync(
    roleFile,
    `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${sqlQuote(role)}') THEN
    CREATE ROLE ${role} LOGIN PASSWORD '${sqlQuote(password)}';
  ELSE
    ALTER ROLE ${role} WITH LOGIN PASSWORD '${sqlQuote(password)}';
  END IF;
END $$;
`,
  );
  try {
    execSync(`${psql} -d postgres -v ON_ERROR_STOP=1 -f "${roleFile}"`, { stdio: "inherit" });
    const exists = execSync(`${psql} -d postgres -tA -c "SELECT 1 FROM pg_database WHERE datname = '${sqlQuote(database)}'"`, {
      encoding: "utf8",
    }).trim();
    if (exists !== "1") {
      execSync(`${psql} -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${database} OWNER ${role}"`, { stdio: "inherit" });
    }
    execSync(`${psql} -d ${database} -v ON_ERROR_STOP=1 -f "${join(root, "db/schema.sql")}"`, { stdio: "inherit" });
  } finally {
    if (existsSync(roleFile)) unlinkSync(roleFile);
  }
}

async function ensureMongo() {
  const mongo = new MongoClient(process.env.MONGODB_URI);
  await mongo.connect();
  await mongo.db().command({ ping: 1 });
  await mongo.close();
}

ensureEnv();
ensurePostgres();
ensureRoleAndDatabase();
await ensureMongo();

const { seed } = await import("./seed.mjs");
await seed();
console.log("UCDI is ready. Start the app with npm run dev.");
