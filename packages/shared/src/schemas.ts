import { z } from "zod";

export const CARE_TYPES = [
  "WATERING",
  "FERTILIZING",
  "REPOTTING",
  "PRUNING",
  "TREATMENT",
  "OTHER",
] as const;

export const CareTypeSchema = z.enum(CARE_TYPES);
export const MonthFrequencySchema = z.array(z.number().int().min(0)).length(12);

export const CreateLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required"),
});

export const CreatePlantSchema = z.object({
  name: z.string().trim().min(1, "Plant name is required"),
  notes: z.string().trim().optional(),
  wateringFreqDays: z.number().int().positive().optional(),
  fertilizingFreqDays: z.number().int().positive().optional(),
  wateringFreqByMonth: MonthFrequencySchema.optional(),
  fertilizingFreqByMonth: MonthFrequencySchema.optional(),
  locationId: z.string().trim().min(1).optional(),
});

export const UpdatePlantSchema = CreatePlantSchema.partial().extend({
  archived: z.boolean().optional(),
  photoUrl: z.string().trim().optional(),
});

export const RecordCareSchema = z.object({
  type: CareTypeSchema,
  plantId: z.string().trim().min(1),
  performedAt: z.string().datetime().optional(),
  note: z.string().optional(),
});

export const UndoCareSchema = z.object({
  plantId: z.string().trim().min(1),
  type: CareTypeSchema,
});

export type CareType = z.infer<typeof CareTypeSchema>;
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type CreatePlantInput = z.infer<typeof CreatePlantSchema>;
export type UpdatePlantInput = z.infer<typeof UpdatePlantSchema>;
export type RecordCareInput = z.infer<typeof RecordCareSchema>;
export type UndoCareInput = z.infer<typeof UndoCareSchema>;
