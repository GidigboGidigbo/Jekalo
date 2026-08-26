import { eq, count, and, sql } from "drizzle-orm";
import { db } from "./index.js";
import { rides } from "./schema.js";

export async function createRide(driverId, fields) {
  const { fromLat, fromLong, toLat, toLong, ...rest } = fields;
  const [row] = await db
    .insert(rides)
    .values({
      ...rest,
      driverId,
      fromLocation: { x: fromLong, y: fromLat },
      toLocation: { x: toLong, y: toLat },
    })
    .returning();
  return row;
}

export async function getRide(id) {
  const [row] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
  return row;
}

export async function getDriverRides(driverId, { limit, offset }) {
  const where = eq(rides.driverId, driverId);
  const rows = await db.select().from(rides).where(where).limit(limit).offset(offset);
  const [{ count: total }] = await db.select({ count: count() }).from(rides).where(where);
  return { rows, total };
}

export async function updateRideStatus(id, driverId, status) {
  const [row] = await db
    .update(rides)
    .set({ status })
    .where(eq(rides.id, id))
    .returning();
  return row;
}

export async function findMatchingRides(originLat, originLng, destLat, destLng, radiusKm = 3) {
  const radiusMeters = radiusKm * 1000;
  const originPoint = sql`ST_SetSRID(ST_MakePoint(${originLng}, ${originLat}), 4326)::geography`;
  const destPoint = sql`ST_SetSRID(ST_MakePoint(${destLng}, ${destLat}), 4326)::geography`;

  return db
    .select()
    .from(rides)
    .where(
      and(
        eq(rides.status, "PENDING"),
        sql`ST_DWithin(${rides.fromLocation}::geography, ${originPoint}, ${radiusMeters})`,
        sql`ST_DWithin(${rides.toLocation}::geography, ${destPoint}, ${radiusMeters})`,
      ),
    )
    .orderBy(sql`ST_Distance(${rides.fromLocation}::geography, ${originPoint})`);
}
