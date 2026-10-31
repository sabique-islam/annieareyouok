import { NextResponse } from "next/server";
import { pool } from "@/lib/db/postgres";
import { dossiers } from "@/lib/db/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await pool.query("SELECT 1 AS ok");
    const collection = await dossiers();
    await collection.estimatedDocumentCount();
    return NextResponse.json({
      ok: true,
      postgres: db.rows[0].ok === 1,
      mongo: true,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
