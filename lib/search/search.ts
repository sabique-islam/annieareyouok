import { embed, toSqlVector } from "./embedding.mjs";
import { query } from "../db/postgres";
import { dossiers } from "../db/mongo";

export type VectorHit = {
  inspection_id: number;
  vehicle_id: number;
  vin: string;
  make: string;
  model: string;
  model_year: number;
  similarity: number;
  excerpt: string;
};

export type TextHit = {
  inspection_id: number;
  vehicle_id: number;
  vin: string;
  make: string;
  model: string;
  model_year: number;
  rank: number;
  headline: string;
};

export type MongoHit = {
  sqlInspectionId: number;
  vin: string;
  excerpt: string;
  score: number;
};

export async function searchCorpus(rawQuery: string, excludeInspectionId?: number) {
  const q = rawQuery.trim();
  if (q.length < 2) {
    return { q, vector: [] as VectorHit[], fullText: [] as TextHit[], mongo: [] as MongoHit[] };
  }

  const vector = await query<VectorHit>(
    `SELECT i.inspection_id,
            i.vehicle_id,
            v.vin,
            cm.make,
            cm.model,
            v.model_year,
            GREATEST(0, 1 - (e.embedding <=> $1::vector)) AS similarity,
            left(e.source_text, 220) AS excerpt
     FROM inspection_embeddings e
     JOIN inspections i ON i.inspection_id = e.inspection_id AND i.status = 'completed'
     JOIN vehicles v ON v.vehicle_id = i.vehicle_id
     JOIN catalog_models cm ON cm.model_id = v.model_id
     WHERE ($2::int IS NULL OR e.inspection_id <> $2)
     ORDER BY e.embedding <=> $1::vector
     LIMIT 5`,
    [toSqlVector(embed(q)), excludeInspectionId ?? null],
  );

  const fullText = await query<TextHit>(
    `SELECT i.inspection_id,
            i.vehicle_id,
            v.vin,
            cm.make,
            cm.model,
            v.model_year,
            ts_rank(i.search_vector, plainto_tsquery('english', $1)) AS rank,
            ts_headline(
              'english',
              i.summary,
              plainto_tsquery('english', $1),
              'StartSel=«, StopSel=», MaxWords=24, MinWords=8'
            ) AS headline
     FROM inspections i
     JOIN vehicles v ON v.vehicle_id = i.vehicle_id
     JOIN catalog_models cm ON cm.model_id = v.model_id
     WHERE i.status = 'completed'
       AND i.search_vector @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC
     LIMIT 5`,
    [q],
  );

  let mongoHits: MongoHit[] = [];
  try {
    const collection = await dossiers();
    const found = await collection
      .find(
        { $text: { $search: q } },
        { projection: { sqlInspectionId: 1, vin: 1, narrative: 1, score: { $meta: "textScore" } } },
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(5)
      .toArray();
    mongoHits = found.map((doc) => ({
      sqlInspectionId: doc.sqlInspectionId,
      vin: doc.vin,
      excerpt: doc.narrative.slice(0, 220),
      score: Number((doc as { score?: number }).score ?? 0),
    }));
  } catch {
    mongoHits = [];
  }

  return { q, vector, fullText, mongo: mongoHits };
}
