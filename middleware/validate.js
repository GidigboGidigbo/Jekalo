/**
 * Body-validation middleware factory.
 *
 * Parses req.body against the given Zod schema. On failure, responds 400 with
 * the standard error envelope and per-field details. On success, replaces
 * req.body with the parsed (trimmed/normalized) data and calls next().
 */
export function validate(schema, message = "Invalid request data.") {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const details = {};
      for (const issue of result.error.issues) {
        const field = issue.path.length > 0 ? issue.path.join(".") : "_error";
        if (!(field in details)) details[field] = issue.message;
      }
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message, details },
      });
    }

    req.body = result.data;
    next();
  };
}
