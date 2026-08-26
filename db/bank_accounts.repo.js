import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { bankAccounts } from "./schema.js";

export async function createBankAccount({
  userId,
  accountNumber,
  bankCode,
  accountName,
  paystackRecipientCode,
}) {
  const [account] = await db
    .insert(bankAccounts)
    .values({
      userId,
      accountNumber,
      bankCode,
      accountName: accountName ?? null,
      paystackRecipientCode: paystackRecipientCode ?? null,
    })
    .returning();
  return account;
}

export async function getBankAccountByUserId(userId) {
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, userId))
    .limit(1);
  return account ?? null;
}

export async function getBankAccountById(id) {
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, id))
    .limit(1);
  return account ?? null;
}

export async function updateBankAccount(userId, fields) {
  const updates = { updatedAt: new Date() };
  if (fields.accountNumber !== undefined) updates.accountNumber = fields.accountNumber;
  if (fields.bankCode !== undefined) updates.bankCode = fields.bankCode;
  if (fields.accountName !== undefined) updates.accountName = fields.accountName;
  if (fields.paystackRecipientCode !== undefined) updates.paystackRecipientCode = fields.paystackRecipientCode;

  const [account] = await db
    .update(bankAccounts)
    .set(updates)
    .where(eq(bankAccounts.userId, userId))
    .returning();
  return account ?? null;
}

export async function deleteBankAccount(userId) {
  await db.delete(bankAccounts).where(eq(bankAccounts.userId, userId));
}
