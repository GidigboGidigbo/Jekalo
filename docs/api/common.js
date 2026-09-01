import { z } from "zod";
import { registry } from "../registry.js";

// Shared schema pieces used by the resource doc modules.
//
// Component pattern: a schema that should appear in components/schemas is
// defined with `.openapi("<Name>", { ... })` — which attaches the component
// name/refId to the instance — and then registered with
// `registry.register("<Name>", <same instance>)`. Using that same instance as
// a request/response body (or as the item type of a direct array) makes
// zod-to-openapi emit a `$ref` to its component; nested properties inline.

// Every error response follows the envelope { error: { code, message, details? } }.
export const errorSchema = z
  .object({
    error: z.object({
      code: z.string().describe("Machine-readable error code."),
      message: z.string().describe("Human-readable error message."),
      details: z
        .record(z.string())
        .describe("Per-field validation details, present on VALIDATION_FAILED only.")
        .optional(),
    }),
  })
  .openapi("Error", { description: "Uniform error envelope used by every endpoint." });
export function registerError() {
  registry.register("Error", errorSchema);
}

// Paginated list envelope: { data: [...], pagination: {...} }.
export const paginationSchema = z.object({
  page: z.number().int().min(1).describe("Current page, 1-based."),
  limit: z.number().int().min(1).max(100).describe("Items per page."),
  total: z.number().int().min(0).describe("Total number of matching rows."),
  total_pages: z.number().int().min(0).describe("Total number of pages."),
});

// Query parameters accepted by paginated list endpoints (coerced, optional).
export const paginationQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .openapi({ param: { description: "Page number, 1-based. Default 1." } })
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .openapi({ param: { description: "Items per page, capped at 100. Default 20." } })
    .optional(),
});

// A paginated list body over a registered item schema.
export function paginatedListSchema(itemsSchema) {
  return z.object({
    data: z.array(itemsSchema),
    pagination: paginationSchema,
  });
}

// Money in kobo (NGN 1/100). The database, API payloads and Paystack all use
// whole kobo integers end-to-end.
export const moneyKobo = (message) =>
  z
    .number({ error: message })
    .int(message)
    .describe("Whole kobo (NGN 1/100).");

export const uuidField = (description) =>
  z.uuid().openapi({
    type: "string",
    format: "uuid",
    description,
    example: "e7cb3d75-1f99-49e9-8ef0-2b3f7568be71",
  });

export const dateTimeField = (description) =>
  z.iso.datetime({ offset: true }).openapi({
    type: "string",
    format: "date-time",
    description,
  });