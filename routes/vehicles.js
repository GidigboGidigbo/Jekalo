import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { registerVehicleSchema, updateVehicleSchema } from "../validationSchemas/vehicles.js";
import {
  getOwnedVehicle,
  getDriverVehicles,
  registerVehicle,
  updateVehicleDetails,
  deleteVehicle,
} from "../db/vehicle.repo.js";

const router = Router();

router.use(requireAuth);

function isUniqueViolation(err) {
  return err?.code === "23505";
}

function isForeignKeyViolation(err) {
  return err?.code === "23503";
}

router.post(
  "/",
  validate(registerVehicleSchema, "Invalid vehicle data."),
  async (req, res) => {
    try {
      const vehicle = await registerVehicle(req.body, req.user.id);
      return res.status(201).json(vehicle);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({
          error: { code: "STATE_CONFLICT", message: "This vehicle is already registered." },
        });
      }
      throw err;
    }
  },
);

async function listOwnedVehicles(req, res) {
  const vehicles = await getDriverVehicles(req.user.id);
  return res.status(200).json(vehicles);
}

router.get("/", listOwnedVehicles);
router.get("/mine", listOwnedVehicles);

router.get("/:id", async (req, res) => {
  const vehicle = await getOwnedVehicle(req.params.id, req.user.id);

  if (!vehicle) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Vehicle not found." },
    });
  }

  return res.status(200).json(vehicle);
});

async function updateOwnedVehicle(req, res) {
  try {
    const updated = await updateVehicleDetails(req.params.id, req.user.id, req.body);

    if (!updated) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Vehicle not found." },
      });
    }

    return res.status(200).json(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        error: { code: "STATE_CONFLICT", message: "This vehicle is already registered." },
      });
    }
    throw err;
  }
}

router.patch(
  "/:id",
  validate(updateVehicleSchema, "Invalid vehicle data."),
  updateOwnedVehicle,
);

router.put(
  "/:id",
  validate(updateVehicleSchema, "Invalid vehicle data."),
  updateOwnedVehicle,
);

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await deleteVehicle(req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Vehicle not found." },
      });
    }

    return res.status(204).end();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return res.status(422).json({
        error: {
          code: "BUSINESS_RULE_VIOLATION",
          message: "Vehicle cannot be deleted while it is used by an active ride.",
        },
      });
    }
    throw err;
  }
});

export default router;
