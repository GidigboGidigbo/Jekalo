import { z } from "zod";
import { registry } from "../registry.js";
import { registerError, errorSchema, uuidField, dateTimeField } from "./common.js";
import { registerSchema, loginSchema, updateProfileSchema } from "../../validationSchemas/users.js";

registerError();

const userSchema = z
  .object({
    id: uuidField("User ID."),
    firstName: z.string().describe("First name."),
    lastName: z.string().describe("Last name."),
    email: z.email().describe("Lower-cased email address."),
    phoneNumber: z.string().nullish().describe("Phone number."),
    profilePicture: z.url().nullish().describe("Profile picture URL."),
    ninVerified: z.boolean().describe("NIN verification status (KYC, forward-compat)."),
    bvnVerified: z.boolean().describe("BVN verification status (KYC, forward-compat)."),
    createdAt: dateTimeField("Account creation time."),
  })
  .openapi("User", {
    description: "Public user record (sensitive fields stripped).",
  });
registry.register("User", userSchema);

const loginResponseSchema = z
  .object({
    accessToken: z.string().describe("JWT bearer token."),
    tokenType: z.string().describe('Always "Bearer".'),
    expiresIn: z.number().int().positive().describe("Token lifetime in seconds."),
    user: userSchema,
  })
  .openapi("LoginResponse", { description: "Successful login payload." });
registry.register("LoginResponse", loginResponseSchema);

const registerRequestSchema = registerSchema.openapi("RegisterRequest", {
  description: "Registration payload.",
});
const loginRequestSchema = loginSchema.openapi("LoginRequest", {
  description: "Login payload — email or phone plus password.",
});
const updateProfileRequestSchema = updateProfileSchema.openapi("UpdateProfileRequest", {
  description: "Profile update payload. All fields optional.",
});
registry.register("RegisterRequest", registerRequestSchema);
registry.register("LoginRequest", loginRequestSchema);
registry.register("UpdateProfileRequest", updateProfileRequestSchema);

registry.registerPath({
  method: "post",
  path: "/users/register",
  operationId: "registerUser",
  summary: "Create a user account",
  description:
    "Registers a rider/driver account. Email is lower-cased and uniqueness is enforced " +
    "case-insensitively; duplicate emails return 409.",
  tags: ["Users"],
  request: {
    body: { content: { "application/json": { schema: registerRequestSchema } } },
  },
  responses: {
    201: {
      description: "Account created.",
      content: { "application/json": { schema: z.object({ user: userSchema }) } },
    },
    400: {
      description: "Validation failed.",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "A user with this email already exists.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/users/login",
  operationId: "loginUser",
  summary: "Authenticate with email or phone plus password",
  description: "Returns a JWT access token along with the public user record.",
  tags: ["Users"],
  request: { body: { content: { "application/json": { schema: loginRequestSchema } } } },
  responses: {
    200: {
      description: "Authenticated.",
      content: { "application/json": { schema: loginResponseSchema } },
    },
    401: {
      description: "Invalid credentials.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/users/profile/me",
  operationId: "getOwnProfile",
  summary: "Fetch the authenticated user's profile",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Profile fetched.",
      content: { "application/json": { schema: z.object({ user: userSchema }) } },
    },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "put",
  path: "/users/profile/me",
  operationId: "updateOwnProfile",
  summary: "Update the authenticated user's profile",
  description:
    "All fields optional. Changing email to one already in use by another account returns 409.",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: updateProfileRequestSchema } } },
  },
  responses: {
    200: {
      description: "Profile updated.",
      content: { "application/json": { schema: z.object({ user: userSchema }) } },
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
      description: "Email is already in use by another account.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/users/profile/me",
  operationId: "deleteOwnAccount",
  summary: "Delete the authenticated user's account",
  tags: ["Users"],
  security: [{ bearerAuth: [] }],
  responses: {
    204: { description: "Account deleted. No content." },
    401: {
      description: "Missing or invalid token.",
      content: { "application/json": { schema: errorSchema } },
    },
  },
});