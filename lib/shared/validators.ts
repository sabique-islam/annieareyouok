import { z } from "zod";
import { CHECKPOINTS } from "../inspections/checklist.mjs";

const checkpointNames = CHECKPOINTS.map((item) => item.itemName);

export const loginSchema = z.union([
  z.object({
    email: z.string().trim().email("Enter a valid email."),
    password: z.string().min(1, "Enter a password."),
  }),
  z.object({
    demo: z.enum(["admin", "inspector", "buyer"]),
  }),
]);

export const vehicleSchema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must be 17 characters and cannot contain I, O, or Q."),
  modelId: z.coerce.number().int().positive(),
  dealerId: z.coerce.number().int().positive(),
  variant: z.string().trim().min(1).max(40),
  modelYear: z.coerce.number().int().min(1995).max(2030),
  fuelType: z.enum(["petrol", "diesel", "cng", "electric", "hybrid"]),
  transmission: z.enum(["manual", "automatic", "amt", "cvt", "dct"]),
  odometerKm: z.coerce.number().int().min(0).max(1_000_000),
  color: z.string().trim().min(2).max(30),
  registrationState: z.string().trim().min(2).max(30),
  ownerCount: z.coerce.number().int().min(1).max(12),
  accidentCount: z.coerce.number().int().min(0).max(20),
  listPrice: z.coerce.number().positive().max(50_000_000),
  originalMsrp: z.coerce.number().positive().max(50_000_000),
  status: z.enum(["available", "under_inspection", "sold", "withdrawn"]),
});

export const priceSchema = z.object({
  listPrice: z.coerce.number().positive().max(50_000_000),
});

export const inspectionSchema = z
  .object({
    vehicleId: z.coerce.number().int().positive(),
    odometerKm: z.coerce.number().int().min(0).max(1_000_000),
    summary: z.string().trim().min(20).max(600),
    narrative: z.string().trim().min(40).max(4000),
    recommendation: z.enum(["buy", "negotiate", "avoid"]),
    environment: z.object({
      city: z.string().trim().min(2).max(60),
      weather: z.string().trim().min(2).max(40),
      lighting: z.string().trim().min(2).max(40),
    }),
    checkpoints: z
      .array(
        z.object({
          category: z.enum([
            "engine",
            "transmission",
            "brakes",
            "suspension",
            "electrical",
            "body",
            "interior",
            "tyres",
            "underbody",
          ]),
          itemName: z.string().trim().min(3).max(80),
          result: z.enum(["pass", "fail", "advisory", "not_tested"]),
          score: z.coerce.number().min(0).max(10),
          severity: z.enum(["none", "minor", "moderate", "major", "critical"]),
        }),
      )
      .length(checkpointNames.length),
    defects: z
      .array(
        z.object({
          component: z.string().trim().min(2).max(60),
          description: z.string().trim().min(8).max(400),
          severity: z.enum(["minor", "moderate", "major", "critical"]),
          repairCost: z.coerce.number().min(0),
          affectsSafety: z.boolean(),
          itemName: z.string().trim().optional(),
        }),
      )
      .max(12),
  })
  .superRefine((value, ctx) => {
    const names = new Set(value.checkpoints.map((row) => row.itemName));
    for (const itemName of checkpointNames) {
      if (!names.has(itemName)) {
        ctx.addIssue({ code: "custom", message: `Missing checkpoint: ${itemName}.` });
      }
    }
    if (value.checkpoints.filter((row) => row.result !== "not_tested").length === 0) {
      ctx.addIssue({ code: "custom", message: "At least one checkpoint must be tested." });
    }
    for (const row of value.checkpoints) {
      if (row.result === "fail" && row.severity === "none") {
        ctx.addIssue({ code: "custom", message: `${row.itemName} failed, so it needs a severity.` });
      }
    }
  });

export const userSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
  roleName: z.enum(["admin", "inspector", "buyer"]),
});

export const marketSchema = z.object({
  modelId: z.coerce.number().int().positive(),
  modelYear: z.coerce.number().int().min(1995).max(2030),
  odometerKm: z.coerce.number().int().min(0).max(1_000_000),
  salePrice: z.coerce.number().positive().max(50_000_000),
  conditionScore: z.coerce.number().min(0).max(100).optional().nullable(),
  city: z.string().trim().min(2).max(60),
  soldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date."),
  source: z.string().trim().min(2).max(40),
});
