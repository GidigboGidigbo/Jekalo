import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extends Zod with the `.openapi()` annotation helper (reads native v4
// `.meta()` too, but `.openapi()` gives typed convenience). Must run once,
// before any docs/api module annotates a schema. It only attaches metadata;
// validation behaviour is untouched.
extendZodWithOpenApi(z);

// Single shared registry. docs/api/*.openapi.js register their components and
// paths here; docs/openapi.js statically imports every module, then emits the
// document. Modules are coupled by convention, not by a filesystem scan.
export const registry = new OpenAPIRegistry();