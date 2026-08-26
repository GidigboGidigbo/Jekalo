import { paystackRequest } from "../utils/paystack.js";

export async function resolveAccountNumber(accountNumber, bankCode) {
  const data = await paystackRequest(
    `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
  );
  return {
    accountName: data.account_name,
    accountNumber: data.account_number,
    bankId: data.bank_id,
  };
}

export async function createTransferRecipient({ accountNumber, bankCode, name }) {
  const data = await paystackRequest("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN",
    },
  });
  return {
    recipientCode: data.recipient_code,
    accountName: data.name,
  };
}
