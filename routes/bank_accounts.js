import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { listBanks, findBankByCode } from "../db/banks.repo.js";
import {
  createBankAccount,
  getBankAccountByUserId,
  updateBankAccount,
  deleteBankAccount,
} from "../db/bank_accounts.repo.js";
import {
  resolveAccountNumber,
  createTransferRecipient,
} from "../services/bank_accounts.service.js";
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  resolveAccountSchema,
} from "../validationSchemas/bank_accounts.js";
import { PaystackError } from "../utils/paystack.js";

const router = Router();
router.use(requireAuth);

function maskAccountNumber(accountNumber) {
  if (!accountNumber || accountNumber.length < 4) return accountNumber;
  return `${"*".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}

async function serializeBankAccount(account) {
  if (!account) return null;
  const bank = await findBankByCode(account.bankCode);
  return {
    id: account.id,
    accountNumber: account.accountNumber,
    bankCode: account.bankCode,
    bankName: bank?.name ?? null,
    accountName: account.accountName,
    createdAt: account.createdAt,
  };
}

router.get("/banks", async (req, res) => {
  const banks = await listBanks();
  res.json(banks);
});

router.post(
  "/resolve",
  validate(resolveAccountSchema, "Invalid account details."),
  async (req, res) => {
    try {
      const { accountNumber, bankCode } = req.body;
      const result = await resolveAccountNumber(accountNumber, bankCode);
      res.json(result);
    } catch (err) {
      if (err instanceof PaystackError) {
        return res.status(502).json({
          error: { code: "GATEWAY_ERROR", message: "Could not verify account number." },
        });
      }
      throw err;
    }
  },
);

router.get("/", async (req, res) => {
  const account = await getBankAccountByUserId(req.user.id);
  if (!account) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "No bank account on file." },
    });
  }
  res.json(await serializeBankAccount(account));
});

router.post(
  "/",
  validate(createBankAccountSchema, "Invalid bank account data."),
  async (req, res) => {
    try {
      const existing = await getBankAccountByUserId(req.user.id);
      if (existing) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "You already have a bank account on file." },
        });
      }

      const { accountNumber, bankCode } = req.body;

      const resolved = await resolveAccountNumber(accountNumber, bankCode);
      const { recipientCode } = await createTransferRecipient({
        accountNumber,
        bankCode,
        name: resolved.accountName,
      });

      const account = await createBankAccount({
        userId: req.user.id,
        accountNumber: maskAccountNumber(accountNumber),
        bankCode,
        accountName: resolved.accountName,
        paystackRecipientCode: recipientCode,
      });

      res.status(201).json(await serializeBankAccount(account));
    } catch (err) {
      if (err instanceof PaystackError) {
        return res.status(502).json({
          error: { code: "GATEWAY_ERROR", message: "Could not set up bank account." },
        });
      }
      throw err;
    }
  },
);

router.patch(
  "/",
  validate(updateBankAccountSchema, "Invalid bank account data."),
  async (req, res) => {
    try {
      const existing = await getBankAccountByUserId(req.user.id);
      if (!existing) {
        return res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "No bank account on file." },
        });
      }

      const { accountNumber, bankCode } = req.body;

      const resolved = await resolveAccountNumber(accountNumber, bankCode);
      const { recipientCode } = await createTransferRecipient({
        accountNumber,
        bankCode,
        name: resolved.accountName,
      });

      const account = await updateBankAccount(req.user.id, {
        accountNumber: maskAccountNumber(accountNumber),
        bankCode,
        accountName: resolved.accountName,
        paystackRecipientCode: recipientCode,
      });

      res.json(await serializeBankAccount(account));
    } catch (err) {
      if (err instanceof PaystackError) {
        return res.status(502).json({
          error: { code: "GATEWAY_ERROR", message: "Could not update bank account." },
        });
      }
      throw err;
    }
  },
);

router.delete("/", async (req, res) => {
  const existing = await getBankAccountByUserId(req.user.id);
  if (!existing) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "No bank account on file." },
    });
  }
  await deleteBankAccount(req.user.id);
  res.status(204).end();
});

export default router;
