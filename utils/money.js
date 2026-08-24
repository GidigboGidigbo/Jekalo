// All monetary amounts are integers in kobo (the smallest unit of Naira)
// everywhere: API payloads, Paystack requests and database columns alike.
// There are no unit conversions — only the platform fee computation.

// Platform commission in basis points (100 bps = 1%).
export const PLATFORM_FEE_BPS = 100;

export function computePlatformFee(amountKobo) {
  return Math.round((amountKobo * PLATFORM_FEE_BPS) / 10000);
}
