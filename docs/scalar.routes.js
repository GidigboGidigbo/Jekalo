import { Router } from "express";
import { buildOpenApiSpec } from "./openapi.js";

const router = Router();
let scalarMiddleware;

// The docs root is a friendly alias for the reference UI, so
// /api/v1/docs works instead of only /api/v1/docs/reference.
router.get("/", (req, res) => {
  res.redirect("/api/v1/docs/reference");
});

router.get("/openapi.json", (req, res) => {
  res.json(buildOpenApiSpec());
});

router.use("/reference", async (req, res, next) => {
  try {
    if (!scalarMiddleware) {
      const { apiReference } = await import("@scalar/express-api-reference");
      scalarMiddleware = apiReference({
        content: buildOpenApiSpec(),
        pageTitle: "Jekalo API Reference",
        theme: "default",
      });
    }
    return scalarMiddleware(req, res, next);
  } catch (error) {
    return next(error);
  }
});

export default router;