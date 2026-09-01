import { z } from "zod";
import { registry } from "../registry.js";
import { registerError, errorSchema, uuidField, dateTimeField } from "./common.js";
import { registerVehicleSchema, updateVehicleSchema } from "../../validationSchemas/vehicles.js";

registerError();

const vehicleSchema = z
  .object({
    id: uuidField("Vehicle ID."),
    driverId: uuidField("Owning driver's user ID."),
    make: z.string().describe("Vehicle make."),
    model: z.string().describe("Vehicle model."),
    manufacturingYear: z.string().describe("Manufacturing year."),
    color: z.string().describe("Vehicle colour."),
    bodyType: z.string().describe("Body type."),
    pictures: z.array(z.string()).describe("Photo URLs."),
    seatingCapacity: z.number().int().positive().describe("Seating capacity."),
    licensePlateNumber: z.string().describe("License plate number."),
    createdAt: dateTimeField("Registration time."),
    updatedAt: dateTimeField("Last update time."),
  })
  .openapi("Vehicle", { description: "Vehicle record, owned by a driver." });
registry.register("Vehicle", vehicleSchema);

const registerVehicleRequestSchema = registerVehicleSchema.openapi("RegisterVehicleRequest", {
  description: "Vehicle registration payload.",
});
const updateVehicleRequestSchema = updateVehicleSchema.openapi("UpdateVehicleRequest", {
  description: "Partial vehicle update. At least one field required.",
});
registry.register("RegisterVehicleRequest", registerVehicleRequestSchema);
registry.register("UpdateVehicleRequest", updateVehicleRequestSchema);

registry.registerPath({
  method: "post",
  path: "/vehicles",
  operationId: "registerVehicle",
  summary: "Register a vehicle",
  description:
    "Registers a vehicle owned by the authenticated user. Duplicate registrations return 409.",
  tags: ["Vehicles"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: registerVehicleRequestSchema } } },
  },
  responses: {
    201: {
      description: "Vehicle registered.",
      content: { "application/json": { schema: vehicleSchema } },
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
      description: "This vehicle is already registered.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const listVehicles = {
  method: "get",
  operationId: "listVehicles",
  summary: "List the authenticated user's vehicles",
  tags: ["Vehicles"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Vehicles fetched.",
      content: { "application/json": { schema: z.array(vehicleSchema) } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
};

registry.registerPath({ path: "/vehicles", ...listVehicles, description: "Alias of GET /vehicles/mine." });
registry.registerPath({
  path: "/vehicles/mine",
  ...listVehicles,
  description: "Vehicles owned by the authenticated user.",
});

registry.registerPath({
  method: "get",
  path: "/vehicles/{id}",
  operationId: "getVehicle",
  summary: "Fetch a single owned vehicle",
  tags: ["Vehicles"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Vehicle ID.") }) },
  responses: {
    200: {
      description: "Vehicle fetched.",
      content: { "application/json": { schema: vehicleSchema } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Vehicle not found.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

const updateVehicle = {
  operationId: "updateVehicle",
  summary: "Update a single owned vehicle",
  description: "At least one vehicle field is required.",
  tags: ["Vehicles"],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: uuidField("Vehicle ID.") }),
    body: { content: { "application/json": { schema: updateVehicleRequestSchema } } },
  },
  responses: {
    200: {
      description: "Vehicle updated.",
      content: { "application/json": { schema: vehicleSchema } },
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
      description: "Vehicle not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "This vehicle is already registered.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
};

registry.registerPath({ method: "patch", path: "/vehicles/{id}", ...updateVehicle });
registry.registerPath({ method: "put", path: "/vehicles/{id}", ...updateVehicle });

registry.registerPath({
  method: "delete",
  path: "/vehicles/{id}",
  operationId: "deleteVehicle",
  summary: "Delete a single owned vehicle",
  description: "Deleting a vehicle used by an active ride returns 422.",
  tags: ["Vehicles"],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: uuidField("Vehicle ID.") }) },
  responses: {
    204: { description: "Vehicle deleted. No content." },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
    404: {
      description: "Vehicle not found.",
      content: { "application/json": { schema: errorSchema } },
    },
    422: {
      description: "Vehicle is used by an active ride and cannot be deleted.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});