import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { registerSchema, loginSchema, updateProfileSchema } from "../validationSchemas/users.js";
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  updateUser,
  deleteUser,
} from "../db/users.repo.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "jekalo-dev-secret";
const TOKEN_EXPIRES_IN_SECONDS = 3600; // 1 hour

// --- helpers ---------------------------------------------------------------

/** Strip sensitive fields before returning a user record to the client. */
function toPublicUser(user) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

/** Postgres unique-constraint violation (e.g. duplicate email). */
function isUniqueViolation(err) {
  return err && err.code === "23505";
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES_IN_SECONDS,
  });
}

// --- endpoints -------------------------------------------------------------

// POST /register — create a new user account.
router.post(
  "/register",
  validate(registerSchema, "Invalid registration data."),
  async (req, res) => {
    const { firstName, lastName, email, phoneNumber, password, profilePicture } =
      req.body;

    if (await findUserByEmail(email)) {
      return res.status(409).json({
        error: { code: "STATE_CONFLICT", message: "A user with this email already exists." },
      });
    }

    try {
      const user = await createUser({
        firstName,
        lastName,
        email,
        phoneNumber,
        passwordHash: await bcrypt.hash(password, 10),
        profilePicture,
      });
      res.status(201).json({ user: toPublicUser(user) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "A user with this email already exists." },
        });
      }
      throw err;
    }
  },
);

// POST /login — authenticate with email or phone number + password.
router.post("/login", validate(loginSchema, "Invalid login data."), async (req, res) => {
  const { identifier, password } = req.body;

  const user = (await findUserByEmail(identifier)) ?? (await findUserByPhone(identifier));
  const credentialsValid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!credentialsValid) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid credentials." },
    });
  }

  res.json({
    accessToken: signToken(user),
    tokenType: "Bearer",
    expiresIn: TOKEN_EXPIRES_IN_SECONDS,
    user: toPublicUser(user),
  });
});

// GET /profile/me — fetch the authenticated user's own profile.
router.get("/profile/me", requireAuth, (req, res) => {
  res.json({ user: toPublicUser(req.user) });
});

// PUT /profile/me — update the authenticated user's own profile.
router.put(
  "/profile/me",
  requireAuth,
  validate(updateProfileSchema, "Invalid profile data."),
  async (req, res) => {
    const { firstName, lastName, email, phoneNumber, profilePicture } = req.body;

    if (email !== undefined) {
      const existing = await findUserByEmail(email);
      if (existing && existing.id !== req.user.id) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "A user with this email already exists." },
        });
      }
    }

    try {
      const updated = await updateUser(req.user.id, {
        firstName,
        lastName,
        email,
        phoneNumber,
        profilePicture,
      });
      res.json({ user: toPublicUser(updated) });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "A user with this email already exists." },
        });
      }
      throw err;
    }
  },
);

// DELETE /profile/me — remove the authenticated user's own account.
router.delete("/profile/me", requireAuth, async (req, res) => {
  await deleteUser(req.user.id);
  res.status(204).end();
});

export default router;
