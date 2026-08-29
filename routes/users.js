import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { registerSchema, loginSchema, updateProfileSchema, verifyDriverSchema } from "../validationSchemas/users.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import {
  createUser,
  findUserByEmail,
  findUserByPhone,
  updateUser,
  updateVerificationStatus,
  updateDriverVerificationStatus,
  deleteUser,
} from "../db/users.repo.js";
import { verifyWithDojah, verifyDriverWithDojah, validateDojahConfig } from "../services/dojah.js";

const router = express.Router();

// Validate Dojah configuration on startup
validateDojahConfig();

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

// POST /register — create a new user account with Dojah BVN/NIN verification.
// User is only created in the database if Dojah verification succeeds.
router.post(
  "/register",
  validate(registerSchema, "Invalid registration data."),
  async (req, res) => {
    const { firstName, lastName, email, phoneNumber, password, profilePicture, nin, bvn, selfie } =
      req.body;

    if (await findUserByEmail(email)) {
      return res.status(409).json({
        error: { code: "STATE_CONFLICT", message: "A user with this email already exists." },
      });
    }

    try {
      // Step 1: Verify with Dojah FIRST (before creating user)
      // Note: Selfie is not stored, just used for verification
      const verificationResult = await verifyWithDojah({
        nin,
        bvn,
        selfie,
      });

      // Step 2: Check if verification succeeded
      if (!verificationResult.verified) {
        return res.status(422).json({
          error: {
            code: "VERIFICATION_FAILED",
            message: "Dojah verification failed. Please verify your NIN and BVN details.",
            details: {
              ninVerified: verificationResult.ninVerified,
              bvnVerified: verificationResult.bvnVerified,
            },
          },
        });
      }

      // Step 3: Create user only after successful verification
      const user = await createUser({
        firstName,
        lastName,
        email,
        phoneNumber,
        passwordHash: await bcrypt.hash(password, 10),
        profilePicture,
      });

      // Step 4: Update user with verification status
      await updateVerificationStatus(user.id, {
        ninVerified: verificationResult.ninVerified,
        bvnVerified: verificationResult.bvnVerified,
      });

      // Fetch updated user record
      const updatedUser = {
        ...user,
        ninVerified: verificationResult.ninVerified,
        bvnVerified: verificationResult.bvnVerified,
      };

      res.status(201).json({ user: toPublicUser(updatedUser) });
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

// POST /verify_rider — verify a user as a driver (requires driver's license and selfie).
router.post(
  "/verify_rider",
  requireAuth,
  validate(verifyDriverSchema, "Invalid driver verification data."),
  async (req, res) => {
    const { driverLicense, selfie } = req.body;
    const CONFIDENCE_THRESHOLD = 60; // Dojah recommends 60+ for successful match

    try {
      // Verify driver with Dojah
      const verificationResult = await verifyDriverWithDojah({
        driverLicense,
        selfie,
      });

      // Check if match meets confidence threshold
      const isVerified = verificationResult.verified && verificationResult.confidenceValue >= CONFIDENCE_THRESHOLD;

      // Update user's driver verification status
      await updateDriverVerificationStatus(req.user.id, isVerified);

      // Fetch updated user record
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      res.status(200).json({
        message: "Driver verification completed",
        verified: isVerified,
        confidenceValue: verificationResult.confidenceValue,
        details: {
          match: verificationResult.verified,
          thresholdUsed: CONFIDENCE_THRESHOLD,
        },
        user: toPublicUser(updatedUser[0]),
      });
    } catch (err) {
      console.error("Driver verification error:", err);
      throw err;
    }
  },
);

export default router;
