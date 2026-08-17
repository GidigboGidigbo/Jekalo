import { eq, count } from "drizzle-orm";
import { db } from ".";
import { rides } from "./schema";

export async function createRide(driver_id, fields) {
  const { from_lat, from_long, to_lat, to_long, ...rest } = fields;
  const [row] = await db
    .insert(rides)
    .values({
      ...rest,
      driver_id,
      from_location: { x: from_long, y: from_lat },
      to_location: { x: to_long, y: to_lat },
    })
    .returning();
  return row;
}

export async function getRide(id) {
  const [row] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
  return row;
}

export async function getDriverRides(driver_id, { limit, offset }) {
  const where = eq(rides.driver_id, driver_id);
  const rows = await db.select().from(rides).where(where).limit(limit).offset(offset);
  const [{ count: total }] = await db.select({ count: count() }).from(rides).where(where);
  return { rows, total };
}

export async function updateRideStatus(id, driver_id, status) {
  const [row] = await db
    .update(rides)
    .set({ status })
    .where(eq(rides.id, id))
    .returning();
  return row;
}
