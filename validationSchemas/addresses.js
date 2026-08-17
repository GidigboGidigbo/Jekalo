import { z } from "zod";

export const searchAddressSchema = z.object({
  address: z.string({ error: "Address is required." }).min(1, "Address is required."),
});
