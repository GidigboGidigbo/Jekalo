import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { users } from "./schema.js";

/**
 * User repository — the only module that touches the users table.
 * Functions accept/return API-shaped records (camelCase).
 */

export async function createUser({
  firstName,
  lastName,
  email,
  phoneNumber,
  passwordHash,
  profilePicture,
}) {
  const [user] = await db
    .insert(users)
    .values({
      firstName,
      lastName,
      email,
      phoneNumber,
      passwordHash,
      profilePicture: profilePicture ?? null,
    })
    .returning();
  return user;
}

export async function findUserByEmail(email) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return user ?? null;
}

export async function findUserByPhone(phoneNumber) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

/** Applies only the provided fields; returns the updated record. */
export async function updateUser(id, fields) {
  const updates = {};
  if (fields.firstName !== undefined) updates.firstName = fields.firstName;
  if (fields.lastName !== undefined) updates.lastName = fields.lastName;
  if (fields.email !== undefined) updates.email = fields.email;
  if (fields.phoneNumber !== undefined) updates.phoneNumber = fields.phoneNumber;
  if (fields.profilePicture !== undefined) updates.profilePicture = fields.profilePicture;

  const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return user;
}

/**
 * Update a user's BVN and NIN verification status.
 * Used by the Dojah verification flow during signup.
 */
export async function updateVerificationStatus(id, { ninVerified, bvnVerified }) {
  const updates = {};
  if (ninVerified !== undefined) updates.ninVerified = ninVerified;
  if (bvnVerified !== undefined) updates.bvnVerified = bvnVerified;

  const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return user;
}

/**
 * Update a user's driver verification status.
 * Used by the driver verification endpoint.
 */
export async function updateDriverVerificationStatus(id, isVerifiedDriver) {
  const [user] = await db
    .update(users)
    .set({ isVerifiedDriver })
    .where(eq(users.id, id))
    .returning();
  return user;
}

export async function deleteUser(id) {
  await db.delete(users).where(eq(users.id, id));
}
