import { eq, and } from "drizzle-orm";
import { db } from "./index.js";
import { vehicle } from "./schema.js";

export async function registerVehicle(fields, driverId) {
  const [row] = await db.insert(vehicle).values({ ...fields, driverId }).returning();
  return row;
}

export async function updateVehicleDetails(id, driverId, fields) {
  const [row] = await db
    .update(vehicle)
    .set(fields)
    .where(and(eq(vehicle.id, id), eq(vehicle.driverId, driverId)))
    .returning();
  return row;
}

export async function getDriverVehicles(driverId) {
    const rows = await db
      .select()
      .from(vehicle)
      .where(eq(vehicle.driverId, driverId));
    return rows;
}

export async function getVehicle(id) {
    const [row] = await db.select().from(vehicle).where(eq(vehicle.id, id)).limit(1);
    return row;
}

export async function getOwnedVehicle(id, driverId) {
  const [row] = await db
    .select()
    .from(vehicle)
    .where(and(eq(vehicle.id, id), eq(vehicle.driverId, driverId)))
    .limit(1);
  return row;
}

export async function deleteVehicle(id, driverId) {
  const [row] = await db
    .delete(vehicle)
    .where(and(eq(vehicle.id, id), eq(vehicle.driverId, driverId)))
    .returning({ id: vehicle.id });
  return row;
}