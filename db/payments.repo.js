import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./index.js";
import {
  payments,
  ledgerEntries,
  PAYMENT_STATUS,
  LEDGER_ENTRY_TYPE,
  LEDGER_ENTRY_DIRECTION,
  LEDGER_ENTRY_STATUS,
} from "./schema.js";

// All amounts are integers in kobo (see utils/money.js).
export async function createPendingPayment({
  userId,
  purpose,
  rentalBookingId,
  rideBookingId,
  reference,
  amountKobo,
  platformFeeKobo,
  platformPercentage,
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      userId: userId,
      purpose,
      rentalBookingId: rentalBookingId ?? null,
      rideBookingId: rideBookingId ?? null,
      reference,
      amount: amountKobo,
      platformPercentage: platformPercentage.toFixed(2),
      platformFee: platformFeeKobo,
      status: PAYMENT_STATUS.PENDING,
    })
    .returning();
  return payment;
}

export async function getPaymentByReference(reference) {
  const [payment] = await db
    .select()
    .from(payments)
    .where(eq(payments.reference, reference))
    .limit(1);
  return payment ?? null;
}

export async function getPaymentById(id) {
  const [payment] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  return payment ?? null;
}

export async function listPaymentsForUser(userId) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt));
}

// Applies a terminal gateway result. `status` may be null when the gateway
// reports a non-terminal state ("ongoing", "queued") — the row is then only
// refreshed with the extra context.
export async function updatePaymentByReference(reference, { status, channel, gatewayResponse, paidAt }) {
  const [payment] = await db
    .update(payments)
    .set({
      ...(status ? { status } : {}),
      channel: channel ?? null,
      gatewayResponse: gatewayResponse ?? null,
      paidAt: paidAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(payments.reference, reference))
    .returning();
  return payment ?? null;
}

/**
 * Atomically settles a charge: persists the terminal gateway result on the
 * payment row and records its credit ledger entry exactly once. Safe under
 * concurrent webhook + verify replays — the payment row lock serializes them
 * and the unique gateway reference makes a duplicate credit insert a no-op.
 * `status` may be null for non-terminal gateway states ("ongoing", "queued"):
 * the row is then only refreshed with extra context and the ledger untouched.
 * A payment already marked success is returned as-is (settled rows are final).
 */
export async function settleCharge(reference, { status, channel, gatewayResponse, paidAt }) {
  return db.transaction(async (tx) => {
    // Lock the row so racing webhook/verify runs queue up here; whoever goes
    // second re-reads the settled state instead of double-writing.
    const [locked] = await tx
      .select()
      .from(payments)
      .where(eq(payments.reference, reference))
      .limit(1)
      .for("update");
    if (!locked) return null;

    if (locked.status === PAYMENT_STATUS.SUCCESS) {
      return locked;
    }

    const [payment] = await tx
      .update(payments)
      .set({
        ...(status ? { status } : {}),
        channel: channel ?? null,
        gatewayResponse: gatewayResponse ?? null,
        paidAt: paidAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.reference, reference))
      .returning();

    if (status === PAYMENT_STATUS.SUCCESS) {
      await tx
        .insert(ledgerEntries)
        .values({
          paymentId: payment.id,
          entryType: LEDGER_ENTRY_TYPE.CHARGE,
          direction: LEDGER_ENTRY_DIRECTION.CREDIT,
          amount: payment.amount,
          status: LEDGER_ENTRY_STATUS.SUCCESS,
          gatewayReference: reference,
          gatewayResponse: gatewayResponse ?? null,
          completedAt: paidAt ?? new Date(),
        })
        // The unique gateway_reference doubles as idempotency: if another
        // path already recorded this credit, this silently does nothing.
        .onConflictDoNothing({ target: ledgerEntries.gatewayReference });
    }

    return payment ?? null;
  });
}

// Funds still held against this payment in kobo: successful money-in minus
// every debit (pending debits are reserved, failed ones released).
export async function getHeldAmountForPayment(paymentId) {
  const [row] = await db
    .select({
      held: sql`COALESCE(SUM(CASE
        WHEN ${ledgerEntries.direction} = 'credit' AND ${ledgerEntries.status} = 'success' THEN ${ledgerEntries.amount}
        WHEN ${ledgerEntries.direction} = 'debit' AND ${ledgerEntries.status} IN ('pending', 'success') THEN -${ledgerEntries.amount}
        ELSE 0 END), 0)`,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.paymentId, paymentId));
  return Number(row?.held ?? 0);
}
