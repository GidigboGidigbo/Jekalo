import { eq, sql } from "drizzle-orm";
import { db } from "./index.js";
import { banks } from "./schema.js";

export async function upsertBanks(bankList) {
  if (!bankList.length) return;
  await db
    .insert(banks)
    .values(bankList.map((b) => ({
      code: b.code,
      name: b.name,
    })))
    .onConflictDoUpdate({
      target: banks.code,
      set: { name: sql`excluded.name` },
    });
}

export async function listBanks() {
  return db.select().from(banks);
}

export async function findBankByCode(code) {
  const [bank] = await db.select().from(banks).where(eq(banks.code, code)).limit(1);
  return bank ?? null;
}
