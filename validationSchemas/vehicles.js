import { z } from "zod";

export const registerVehicleSchema = z.object({
  make: z.string({ error: "Make is required." }).min(1, "Make is required."),
  model: z.string({ error: "Model is required." }).min(1, "Model is required."),
  manufacturing_year: z.string({ error: "Manufacturing year is required." }).min(1, "Manufacturing year is required."),
  color: z.string({ error: "Color is required." }).min(1, "Color is required."),
  body_type: z.string({ error: "Body type is required." }).min(1, "Body type is required."),
  pictures: z.array(z.string({ error: "Picture is required." })).min(1),
  seating_capacity: z.number({ error: "Seating capacity is required." }).min(1),
  license_plate_number: z.string({ error: "License plate number is required." }).min(1),
});

export const updateVehicleSchema = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  manufacturing_year: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  body_type: z.string().min(1).optional(),
  pictures: z.array(z.string()).min(1).optional(),
  seating_capacity: z.number().min(1).optional(),
  license_plate_number: z.string().min(1).optional(),
});
