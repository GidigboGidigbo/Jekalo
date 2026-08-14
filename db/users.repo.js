import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { users } from "./schema.js";

/**
 * User repository — the only module that touches the users table.
 * Functions accept/return API-shaped records (snake_case) so route handlers
 * stay unchanged from the in-memory version.
 */

function toRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    first_name: row.firstName,
    last_name: row.lastName,
    email: row.email,
    phone_number: row.phoneNumber,
    password_hash: row.passwordHash,
    profile_picture: row.profilePicture,
    nin_verified: row.ninVerified,
    bvn_verified: row.bvnVerified,
    created_at: row.createdAt,
  };
}

export async function createUser({
  first_name,
  last_name,
  email,
  phone_number,
  password_hash,
  profile_picture,
}) {
  const [row] = await db
    .insert(users)
    .values({
      firstName: first_name,
      lastName: last_name,
      email,
      phoneNumber: phone_number,
      passwordHash: password_hash,
      profilePicture: profile_picture ?? null,
    })
    .returning();
  return toRecord(row);
}

export async function findUserByEmail(email) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return toRecord(row);
}

export async function findUserByPhone(phoneNumber) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  return toRecord(row);
}

export async function findUserById(id) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return toRecord(row);
}

/** Applies only the provided fields; returns the updated record. */
export async function updateUser(id, fields) {
  const updates = {};
  if (fields.first_name !== undefined) updates.firstName = fields.first_name;
  if (fields.last_name !== undefined) updates.lastName = fields.last_name;
  if (fields.email !== undefined) updates.email = fields.email;
  if (fields.phone_number !== undefined) updates.phoneNumber = fields.phone_number;
  if (fields.profile_picture !== undefined) updates.profilePicture = fields.profile_picture;

  const [row] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return toRecord(row);
}

export async function deleteUser(id) {
  await db.delete(users).where(eq(users.id, id));
}
