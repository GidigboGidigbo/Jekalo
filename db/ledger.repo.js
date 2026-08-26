import { desc, eq, sql } from "drizzle-orm";
import { db } from "./index.js";
import {
  ledgerEntries,
  LEDGER_ENTRY_TYPE,
  LEDGER_ENTRY_DIRECTION,
  LEDGER_ENTRY_STATUS,
} from "./schema.js";

// Append-only money-movement log (see schema.js). Rows are never deleted and
// only status/response fields ever change; corrections happen by adding new
// entries, never by mutating existing ones.
export async function insertLedgerEntry({
  paymentId,
  entryType,
  direction,
  amountKobo,
  status,
  gatewayReference,
  gatewayResponse,
  completedAt,
}) {
  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      paymentId: paymentId,
      entryType: entryType,
      direction,
      amount: amountKobo,
      ...(status ? { status } : {}),
      gatewayReference: gatewayReference ?? null,
      gatewayResponse: gatewayResponse ?? null,
      ...(completedAt ? { completedAt } : {}),
    })
    .returning();
  return entry;
}

export async function getLedgerEntryByGatewayReference(gatewayReference) {
  if (!gatewayReference) return null;
  const [entry] = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.gatewayReference, gatewayReference))
    .limit(1);
  return entry ?? null;
}

export async function getLedgerEntryById(id) {
  const [entry] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, id)).limit(1);
  return entry ?? null;
}

// The only mutation allowed on an entry: its lifecycle fields.
export async function updateLedgerEntryStatus(id, { status, gatewayResponse }) {
  const [entry] = await db
    .update(ledgerEntries)
    .set({
      ...(status ? { status } : {}),
      ...(gatewayResponse !== undefined ? { gatewayResponse: gatewayResponse } : {}),
      ...(status === "success" || status === "failed" ? { completedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ledgerEntries.id, id))
    .returning();
  return entry ?? null;
}

/**
 * Atomically applies a transfer.reversed event to a payout entry: the payout
 * debit is marked failed, and when the payout had actually succeeded earlier
 * (money genuinely left), a reversal credit records its return — at most once
 * per reversal reference. Concurrent duplicate webhooks serialize on the row
 * lock; the unique gateway reference backstops the credit insert.
 */
export async function applyTransferReversal(entry, { gatewayResponse, reversalReference }) {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.id, entry.id))
      .limit(1)
      .for("update");

    // Only a payout that actually completed sent real money out, so only it
    // needs the return recorded.
    const wasSuccessful = locked?.status === LEDGER_ENTRY_STATUS.SUCCESS;

    const [updated] = await tx
      .update(ledgerEntries)
      .set({
        status: LEDGER_ENTRY_STATUS.FAILED,
        gatewayResponse,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ledgerEntries.id, entry.id))
      .returning();

    if (wasSuccessful && reversalReference) {
      await tx
        .insert(ledgerEntries)
        .values({
          paymentId: updated.paymentId,
          entryType: LEDGER_ENTRY_TYPE.REVERSAL,
          direction: LEDGER_ENTRY_DIRECTION.CREDIT,
          amount: updated.amount,
          status: LEDGER_ENTRY_STATUS.SUCCESS,
          gatewayReference: reversalReference,
          gatewayResponse: `payout ${updated.gatewayReference} reversed`,
          completedAt: new Date(),
        })
        .onConflictDoNothing({ target: ledgerEntries.gatewayReference });
    }

    return updated ?? null;
  });
}

export async function listEntriesForPayment(paymentId) {
  return db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.paymentId, paymentId))
    .orderBy(desc(ledgerEntries.createdAt));
}

// Platform-wide balance in kobo: successful money-in minus every debit
// (pending debits count as reserved/out).
export async function getPlatformBalance() {
  const [row] = await db
    .select({
      balance: sql`COALESCE(SUM(CASE
        WHEN ${ledgerEntries.direction} = 'credit' AND ${ledgerEntries.status} = 'success' THEN ${ledgerEntries.amount}
        WHEN ${ledgerEntries.direction} = 'debit' AND ${ledgerEntries.status} IN ('pending', 'success') THEN -${ledgerEntries.amount}
        ELSE 0 END), 0)`,
    })
    .from(ledgerEntries);
  return Number(row?.balance ?? 0);
}
