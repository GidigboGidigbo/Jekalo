import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiSpec } from "../docs/openapi.js";
import userRoutes from "../routes/users.js";
import vehicleRoutes from "../routes/vehicles.js";
import rideRoutes from "../routes/rides.js";
import rentalRoutes from "../routes/rentals.js";
import paymentRoutes from "../routes/payments.js";
import bankAccountRoutes from "../routes/bank_accounts.js";
import addressRoutes from "../routes/addresses.js";

const spec = () => buildOpenApiSpec();

// Enumerate { method, path } out of an Express router's internal stack.
function registeredRoutes(router) {
  const out = [];
  for (const layer of router.stack ?? []) {
    const route = layer.route;
    if (!route) continue;
    for (const method of Object.keys(route.methods)) {
      if (method === "_all") continue;
      out.push({ method, path: route.path });
    }
  }
  return out;
}

test("generates an OpenAPI 3.1 doc with the base document metadata", () => {
  const s = spec();
  assert.equal(s.openapi, "3.1.0");
  assert.ok(s.info.title);
  assert.equal(s.servers[0].url, "/api/v1");
});

test("documents the full API surface (27 paths, 32 components)", () => {
  const s = spec();
  assert.equal(Object.keys(s.paths).length, 27);
  assert.equal(Object.keys(s.components.schemas).length, 32);
  assert.ok(s["x-tagGroups"]);
});

test("emits $refs for registered schemas rather than inlining", () => {
  const s = spec();
  const isRef = (v) => typeof v === "object" && v !== null && "$ref" in v;

  const checkoutPayment = s.components.schemas.RideCheckout.properties.payment;
  assert.ok(isRef(checkoutPayment), "RideCheckout.payment must be a $ref to Payment");

  const banksItems = s.paths["/bank-accounts/banks"].get.responses[200].content[
    "application/json"
  ].schema.items;
  assert.ok(isRef(banksItems), "banks list items must $ref Bank");

  const bookBody =
    s.paths["/rides/{id}/bookings"].post.requestBody.content["application/json"].schema;
  assert.ok(isRef(bookBody), "booking request body must $ref CreateBookingRequest");

  const errorBody = s.paths["/users/login"].post.responses[401].content[
    "application/json"
  ].schema;
  assert.ok(isRef(errorBody), "error responses must $ref Error");
});

test("documents every registered operation with at least one response", () => {
  for (const [path, pathItem] of Object.entries(spec().paths)) {
    for (const [method, op] of Object.entries(pathItem)) {
      if (method === "parameters") continue;
      assert.ok(op.operationId, `${method.toUpperCase()} ${path} has an operationId`);
      assert.ok(op.responses && Object.keys(op.responses).length > 0,
        `${method.toUpperCase()} ${path} has responses`);
    }
  }
});

test("every $ref in the document resolves to a defined component", () => {
  const s = spec();
  const refs = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      if (typeof node.$ref === "string") refs.push(node.$ref);
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(s);
  for (const ref of refs) {
    const name = ref.split("/").at(-1);
    assert.ok(s.components.schemas[name], `unresolved $ref ${ref}`);
  }
});

// Router paths are relative to their mount prefix (matching index.js/helpers.js),
// and Express uses `:param` while OpenAPI uses `{param}`.
const PREFIXES = new Map([
  [userRoutes, "/users"],
  [vehicleRoutes, "/vehicles"],
  [rideRoutes, "/rides"],
  [rentalRoutes, "/rentals"],
  [paymentRoutes, "/payments"],
  [bankAccountRoutes, "/bank-accounts"],
  [addressRoutes, "/addresses"],
]);

function toOpenApiPath(prefix, routePath) {
  const joined = routePath === "/" ? prefix : `${prefix}${routePath}`;
  return joined.replace(/:[^/]+/g, (param) => `{${param.slice(1)}}`);
}

test("every registered Express route is documented", () => {
  const s = spec();
  for (const [router, prefix] of PREFIXES) {
    for (const { method, path } of registeredRoutes(router)) {
      const full = toOpenApiPath(prefix, path);
      // GET /rides/search is served over the QUERY HTTP method (WebDAV) with a
      // JSON body; OpenAPI 3.1 can't express it, so the docs model it as POST.
      const documented = s.paths[full]?.[method] ?? (method === "query" && s.paths[full]?.post);
      assert.ok(documented, `${method.toUpperCase()} ${full} is not documented`);
    }
  }
  assert.ok(s.paths["/rides/search"], "/rides/search itself must exist in the spec");
});