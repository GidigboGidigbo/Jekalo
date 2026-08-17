import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { registerVehicleSchema, updateVehicleSchema } from "../validationSchemas/vehicles.js";
import {
  getVehicle,
  getDriverVehicles,
  registerVehicle,
  updateVehicleDetails,
} from "../db/vehicle.repo.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  validate(registerVehicleSchema, "Invalid vehicle data."),
  async (req, res) => {
    const vehicle = await registerVehicle(req.body, req.user.id);
    return res.status(201).json(vehicle);
  },
);

router.get("/mine", async (req, res) => {
  const vehicles = await getDriverVehicles(req.user.id);
  return res.status(200).json(vehicles);
});

router.get("/:id", async (req, res) => {
  const vehicle = await getVehicle(req.params.id);

  if (!vehicle) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Vehicle not found." },
    });
  }

  return res.status(200).json(vehicle);
});

router.patch(
  "/:id",
  validate(updateVehicleSchema, "Invalid vehicle data."),
  async (req, res) => {
    const updated = await updateVehicleDetails(req.params.id, req.user.id, req.body);

    if (!updated) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Vehicle not found." },
      });
    }

    return res.status(200).json(updated);
  },
);

export default router;
