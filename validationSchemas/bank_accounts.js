import { z } from "zod";

const MSG = {
  accountNumber: "Account number must be exactly 10 digits.",
  bankCode: "Bank code is required.",
};

const accountNumberField = z
  .string({ error: MSG.accountNumber })
  .length(10, MSG.accountNumber)
  .regex(/^\d+$/, MSG.accountNumber);

const bankCodeField = z
  .string({ error: MSG.bankCode })
  .min(1, MSG.bankCode);

export const createBankAccountSchema = z.object({
  accountNumber: accountNumberField,
  bankCode: bankCodeField,
});

export const updateBankAccountSchema = z
  .object({
    accountNumber: accountNumberField.optional(),
    bankCode: bankCodeField.optional(),
  })
  .refine(
    (data) => {
      const hasAccount = data.accountNumber !== undefined;
      const hasBank = data.bankCode !== undefined;
      return hasAccount === hasBank;
    },
    { message: "accountNumber and bankCode must be provided together." },
  );

export const resolveAccountSchema = z.object({
  accountNumber: accountNumberField,
  bankCode: bankCodeField,
});
