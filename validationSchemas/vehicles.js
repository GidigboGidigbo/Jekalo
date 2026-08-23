import { z } from "zod";

export const registerVehicleSchema = z.object({
  make: z.string({ error: "Make is required." }).min(1, "Make is required."),
  model: z.string({ error: "Model is required." }).min(1, "Model is required."),
  manufacturingYear: z.string({ error: "Manufacturing year is required." }).min(1, "Manufacturing year is required."),
  color: z.string({ error: "Color is required." }).min(1, "Color is required."),
  bodyType: z.string({ error: "Body type is required." }).min(1, "Body type is required."),
  pictures: z.array(z.string({ error: "Picture is required." })).min(1),
  seatingCapacity: z.number({ error: "Seating capacity is required." }).min(1),
  licensePlateNumber: z.string({ error: "License plate number is required." }).min(1),
});

export const updateVehicleSchema = z
  .object({
    make: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    manufacturingYear: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    bodyType: z.string().min(1).optional(),
    pictures: z.array(z.string()).min(1).optional(),
    seatingCapacity: z.number().min(1).optional(),
    licensePlateNumber: z.string().min(1).optional(),
  })
  .refine((fields) => Object.keys(fields).length > 0, {
    message: "At least one vehicle field is required.",
  });
