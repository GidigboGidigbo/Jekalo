import { paystackRequest } from "../utils/paystack.js";
import { upsertBanks } from "../db/banks.repo.js";

export async function syncBanksFromPaystack() {
  const banks = await paystackRequest("/bank?currency=NGN");
  await upsertBanks(banks.map((b) => ({ code: String(b.code), name: b.name })));
  return banks.length;
}
