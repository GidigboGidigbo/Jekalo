import { z } from "zod";
import { registry } from "../registry.js";
import { registerError, errorSchema } from "./common.js";

registerError();

const addressResultSchema = z
  .object({
    displayName: z.string().describe("Formatted place name."),
    lat: z.number().describe("Latitude."),
    lon: z.number().describe("Longitude."),
    placeId: z.string().describe("Google Places place ID."),
  })
  .openapi("AddressResult", { description: "A place returned by the address search." });
registry.register("AddressResult", addressResultSchema);

registry.registerPath({
  method: "get",
  path: "/addresses/search",
  operationId: "searchAddresses",
  summary: "Search addresses via Google Places",
  description: "Places text search for an address fragment, biased to Lagos, Nigeria.",
  tags: ["Addresses"],
  request: {
    query: z.object({
      address: z.string().openapi({ param: { description: "Address fragment to search for." } }),
    }),
  },
  responses: {
    200: {
      description: "Matching places.",
      content: { "application/json": { schema: z.array(addressResultSchema) } },
    },
    400: {
      description: "Missing address query parameter.",
      content: { "application/json": { schema: errorSchema } },
    },
    502: {
      description: "Google Places upstream error.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});