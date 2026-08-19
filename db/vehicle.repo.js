import { eq, and } from "drizzle-orm";
import { db } from "./index.js";
import { vehicle } from "./schema.js";

export async function registerVehicle(fields, driver_id) {
  const [row] = await db.insert(vehicle).values({ ...fields, driver_id }).returning();
  return row;
}

export async function updateVehicleDetails(id, driver_id, fields) {
  const [row] = await db
    .update(vehicle)
    .set(fields)
    .where(and(eq(vehicle.id, id), eq(vehicle.driver_id, driver_id)))
    .returning();
  return row;
}

export async function getDriverVehicles(driver_id) {
    const rows = await db
      .select()
      .from(vehicle)
      .where(eq(vehicle.driver_id, driver_id));
    return rows;
}

export async function getVehicle(id) {
    const [row] = await db.select().from(vehicle).where(eq(vehicle.id, id)).limit(1);
    return row;
}

export async function getOwnedVehicle(id, driver_id) {
  const [row] = await db
    .select()
    .from(vehicle)
    .where(and(eq(vehicle.id, id), eq(vehicle.driver_id, driver_id)))
    .limit(1);
  return row;
}

export async function deleteVehicle(id, driver_id) {
  const [row] = await db
    .delete(vehicle)
    .where(and(eq(vehicle.id, id), eq(vehicle.driver_id, driver_id)))
    .returning({ id: vehicle.id });
  return row;
}