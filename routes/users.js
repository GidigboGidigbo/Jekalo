import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  findUserById,
  updateUser,
  deleteUser,
} from "../db/users.repo.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "jekalo-dev-secret";
const TOKEN_EXPIRES_IN_SECONDS = 3600; // 1 hour

// --- validation schemas ------------------------------------------------------

const MSG = {
  first_name: "First name must be at least 2 characters.",
  last_name: "Last name must be at least 2 characters.",
  email: "A valid email address is required.",
  phone_required: "Phone number is required.",
  phone_string: "Phone number must be a string.",
  password:
    "Password must be at least 8 characters and contain both letters and numbers.",
  profile_picture: "Profile picture must be a URL string or null.",
};

const nameField = (msg) => z.string({ error: msg }).trim().min(2, msg);
const emailField = z
  .string({ error: MSG.email })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: MSG.email }));
const profilePictureField = z.url({ error: MSG.profile_picture }).nullish();

const registerSchema = z.object({
  first_name: nameField(MSG.first_name),
  last_name: nameField(MSG.last_name),
  email: emailField,
  phone_number: z.string({ error: MSG.phone_required }).min(1, MSG.phone_required),
  // Min 8 characters, at least one letter and one number.
  password: z
    .string({ error: MSG.password })
    .min(8, MSG.password)
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, MSG.password),
  profile_picture: profilePictureField,
});

const loginSchema = z.object({
  identifier: z
    .string({ error: "Email or phone number is required." })
    .min(1, "Email or phone number is required."),
  password: z.string({ error: "Password is required." }).min(1, "Password is required."),
});

// All fields optional; only provided fields are updated.
const updateProfileSchema = z.object({
  first_name: nameField(MSG.first_name).optional(),
  last_name: nameField(MSG.last_name).optional(),
  email: emailField.optional(),
  phone_number: z.string({ error: MSG.phone_string }).optional(),
  profile_picture: profilePictureField,
});

// --- helpers ---------------------------------------------------------------

/** Strip sensitive fields before returning a user record to the client. */
function toPublicUser(user) {
  const { password_hash, ...publicUser } = user;
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

/** Bearer-token guard for routes that require a logged-in user. */
async function requireAuth(req, res, next) {
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

// --- endpoints -------------------------------------------------------------

// POST /register — create a new user account.
router.post(
  "/register",
  validate(registerSchema, "Invalid registration data."),
  async (req, res) => {
    const { first_name, last_name, email, phone_number, password, profile_picture } =
      req.body;

    if (await findUserByEmail(email)) {
      return res.status(409).json({
        error: { code: "STATE_CONFLICT", message: "A user with this email already exists." },
      });
    }

    try {
      const user = await createUser({
        first_name,
        last_name,
        email,
        phone_number,
        password_hash: await bcrypt.hash(password, 10),
        profile_picture,
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
  const credentialsValid = user && (await bcrypt.compare(password, user.password_hash));
  if (!credentialsValid) {
    return res.status(401).json({
      error: { code: "UNAUTHENTICATED", message: "Invalid credentials." },
    });
  }

  res.json({
    access_token: signToken(user),
    token_type: "Bearer",
    expires_in: TOKEN_EXPIRES_IN_SECONDS,
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
    const { first_name, last_name, email, phone_number, profile_picture } = req.body;

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
        first_name,
        last_name,
        email,
        phone_number,
        profile_picture,
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
