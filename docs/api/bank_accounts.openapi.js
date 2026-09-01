import { z } from "zod";
import { registry } from "../registry.js";
import { registerError, errorSchema, uuidField, dateTimeField } from "./common.js";
import {
  createBankAccountSchema,
  updateBankAccountSchema,
  resolveAccountSchema,
} from "../../validationSchemas/bank_accounts.js";

registerError();

const bankSchema = z
  .object({
    code: z.string().describe("Paystack bank code."),
    name: z.string().describe("Bank name."),
  })
  .openapi("Bank", { description: "A supported Nigerian bank." });
registry.register("Bank", bankSchema);

const bankAccountSchema = z
  .object({
    id: uuidField("Bank account row ID."),
    accountNumber: z.string().describe("Masked account number (only the last 4 digits shown)."),
    bankCode: z.string().describe("Paystack bank code."),
    bankName: z.string().nullish().describe("Resolved bank name."),
    accountName: z.string().nullish().describe("Account name returned by Paystack."),
    createdAt: dateTimeField("When the account was linked."),
  })
  .openapi("BankAccount", {
    description: "The authenticated user's linked bank account (masked).",
  });
registry.register("BankAccount", bankAccountSchema);

const resolveResultSchema = z
  .object({
    accountName: z.string().describe("Account name returned by Paystack."),
    accountNumber: z.string().describe("Full, unmasked account number."),
    bankId: z.number().describe("Paystack bank ID."),
  })
  .openapi("ResolvedAccount", {
    description: "Result of verifying an account number against a bank code.",
  });
registry.register("ResolvedAccount", resolveResultSchema);

const createBankAccountRequestSchema = createBankAccountSchema.openapi("CreateBankAccountRequest", {
  description: "Account number and bank code.",
});
const updateBankAccountRequestSchema = updateBankAccountSchema.openapi("UpdateBankAccountRequest", {
  description: "accountNumber and bankCode must be provided together.",
});
const resolveAccountRequestSchema = resolveAccountSchema.openapi("ResolveAccountRequest", {
  description: "Account number and bank code to verify.",
});
registry.register("CreateBankAccountRequest", createBankAccountRequestSchema);
registry.register("UpdateBankAccountRequest", updateBankAccountRequestSchema);
registry.register("ResolveAccountRequest", resolveAccountRequestSchema);

registry.registerPath({
  method: "get",
  path: "/bank-accounts/banks",
  operationId: "listBanks",
  summary: "List supported banks",
  description: "Banks are synced from Paystack at server startup.",
  tags: ["Bank Accounts"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Banks fetched.",
      content: { "application/json": { schema: z.array(bankSchema) } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/bank-accounts/resolve",
  operationId: "resolveAccount",
  summary: "Verify an account number against a bank code",
  tags: ["Bank Accounts"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: resolveAccountRequestSchema } } },
  },
  responses: {
    200: {
      description: "Account resolved.",
      content: { "application/json": { schema: resolveResultSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    502: {
      description: "Paystack could not verify the account number.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/bank-accounts",
  operationId: "getBankAccount",
  summary: "Fetch the authenticated user's linked bank account",
  tags: ["Bank Accounts"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Bank account fetched.",
      content: { "application/json": { schema: bankAccountSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "No bank account on file.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/bank-accounts",
  operationId: "createBankAccount",
  summary: "Link the authenticated user's bank account",
  description:
    "Verifies the account number, creates a Paystack transfer recipient, and stores the " +
    "recipient code so ride completions can settle the driver.",
  tags: ["Bank Accounts"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createBankAccountRequestSchema } } },
  },
  responses: {
    201: {
      description: "Bank account linked.",
      content: { "application/json": { schema: bankAccountSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "The user already has a bank account on file.",
      content: { "application/json": { schema: errorSchema } },
    },
    502: {
      description: "Paystack could not set up the bank account.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/bank-accounts",
  operationId: "updateBankAccount",
  summary: "Update the authenticated user's linked bank account",
  description: "accountNumber and bankCode must be provided together.",
  tags: ["Bank Accounts"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: updateBankAccountRequestSchema } } },
  },
  responses: {
    200: {
      description: "Bank account updated.",
      content: { "application/json": { schema: bankAccountSchema } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "No bank account on file.",
      content: { "application/json": { schema: errorSchema } },
    },
    502: {
      description: "Paystack could not update the bank account.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/bank-accounts",
  operationId: "deleteBankAccount",
  summary: "Unlink the authenticated user's bank account",
  tags: ["Bank Accounts"],
  security: [{ bearerAuth: [] }],
  responses: {
    204: { description: "Bank account unlinked. No content." },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "No bank account on file.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});