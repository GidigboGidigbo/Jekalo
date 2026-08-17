import { z } from "zod";

export const createRideSchema = z.object({
  vehicle_id: z.string({ error: "Vehicle ID is required." }).uuid("Vehicle ID must be a valid UUID."),
  available_seat_capacity: z.number({ error: "Available seat capacity is required." }).min(1),
  from_address: z.string({ error: "From address is required." }).min(1, "From address is required."),
  from_lat: z.number({ error: "From latitude is required." }).min(-90).max(90),
  from_long: z.number({ error: "From longitude is required." }).min(-180).max(180),
  to_address: z.string({ error: "To address is required." }).min(1, "To address is required."),
  to_lat: z.number({ error: "To latitude is required." }).min(-90).max(90),
  to_long: z.number({ error: "To longitude is required." }).min(-180).max(180),
  price: z.number({ error: "Price is required." }).min(0),
  pickup_time: z.string({ error: "Pickup time is required." }).min(1),
  pickup_date: z.string({ error: "Pickup date is required." }).min(1),
});

export const updateRideStatusSchema = z.object({
  status: z.enum(["STARTED", "COMPLETED", "CANCELLED"], { error: "Status is required." }),
});
