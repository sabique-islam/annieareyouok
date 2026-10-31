import { Collection, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is not set. Run npm run setup.");
}

export type Dossier = {
  sqlInspectionId: number;
  vin: string;
  narrative: string;
  environment: { city: string; weather: string; lighting: string };
  obdCodes: { code: string; description: string }[];
  media: { label: string; kind: string }[];
  remarks: string[];
  createdAt: Date;
};

const globalForMongo = globalThis as unknown as { ucdiMongo?: MongoClient };

function client() {
  if (!globalForMongo.ucdiMongo) {
    globalForMongo.ucdiMongo = new MongoClient(uri as string);
  }
  return globalForMongo.ucdiMongo;
}

export async function dossiers(): Promise<Collection<Dossier>> {
  const mongo = client();
  await mongo.connect();
  return mongo.db().collection<Dossier>("inspection_dossiers");
}
