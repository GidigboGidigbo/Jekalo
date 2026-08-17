import jwt from "jsonwebtoken";
import { findUserById } from "../db/users.repo.js";

const JWT_SECRET = process.env.JWT_SECRET || "jekalo-dev-secret";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Missing or malformed Authorization header. Expected 'Bearer <token>'.",
      },
    });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid or expired token." },
    });
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid id" },
    });
  }
  req.user = user;
  next();
}
