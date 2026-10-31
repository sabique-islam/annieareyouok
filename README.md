# UCDI

Used-Car Inspection, Condition & Depreciation Intelligence System.

A yard desk for a used-car dealer. Inspectors file a structured condition report. PostgreSQL turns that report into a letter grade and a residual value. MongoDB keeps the variable dossier (narrative, weather, OBD codes, attachment labels). pgvector finds similar narratives when a buyer describes a fault in different words.

This is a DBMS Level 3 mini project. It is not a generic create/read/update/delete demo: the database owns the residual formula, the grade, the audit trail, and the similarity search.

## Stack

- Next.js (App Router) and route handlers
- PostgreSQL 17 with pgvector
- MongoDB
- bcrypt password hashes, JWT session cookie

## Lab accounts

Emails and passwords live in `.env.local` (`DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, and the inspector, field, and buyer pairs). The database stores only bcrypt hashes. The sign-in buttons read those values on the server.

## Setup on this machine

PostgreSQL 17 (the install that has pgvector) and MongoDB need to be running locally.

```bash
npm install
npm run setup
npm run dev
```

`npm run setup` writes `.env.local`, creates the `ucdi` role and database, applies `db/schema.sql`, and loads the sample yard. Open [http://localhost:3000](http://localhost:3000).

`npm run verify` reruns the integrity and search checks and writes `docs/TEST_RESULTS.md`.

Database credentials live in `.env.local`, which is not committed. `.env.example` shows the variable names only.

## What to show

1. Sign in as the inspector. The dashboard lists asks that sit above or below the residual.
2. Open the Honda City. The grade, the residual breakdown, the dossier narrative, and the nearby files are on one page.
3. Open Search and run `hidden corrosion inside the cabin`. Vector search finds the City. Full-text and the MongoDB text index do not, because those words are not in the file. Then run `damp footwell`, which is in the summary, and full-text hits.
4. Open Analytics for the SQL aggregates and the MongoDB city/OBD aggregation.
5. Open Queries and run “Repair totals” (`JOIN`, `GROUP BY`, `HAVING`) and “Not inspected” (`NOT EXISTS`).
6. Change an asking price. The audit on the dashboard is written by a trigger.
7. Sign in as the buyer and confirm Inspect, Add vehicle, and Users are not available.
why 8. As admin, Users shows that the last active admin cannot be deactivated.

## Documentation

The submission write-up is [docs/PROJECT.md](docs/PROJECT.md). The schema is [db/schema.sql](db/schema.sql). The map of what each object does, and why, is [db/schema.md](db/schema.md). Annotated queries are [docs/queries.sql](docs/queries.sql).

## Team

Replace these labels with the two approved members before submission, and make the Git commits under each person’s account.

- Member A, database: schema, constraints, triggers, residual function, views, seed data, test checks
- Member B, application: Next.js desk, authentication, MongoDB dossiers, search page, analytics

## Docker option

`docker-compose.yml` is for a machine that does not already have PostgreSQL and MongoDB. Export `POSTGRES_PASSWORD`, point `DATABASE_URL` at it, then `docker compose up -d` and `npm run seed`. This workstation uses the local PostgreSQL 17 and MongoDB installs instead.
