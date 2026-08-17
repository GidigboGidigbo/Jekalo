import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { parsePagination, paginatedResponse } from "../utils/pagination.js";
import { createRideSchema, updateRideStatusSchema } from "../validationSchemas/rides.js";
import {
  createRide,
  getRide,
  getDriverRides,
  updateRideStatus,
} from "../db/rides.repo.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/",
  validate(createRideSchema, "Invalid ride data."),
  async (req, res) => {
    const ride = await createRide(req.user.id, req.body);
    return res.status(201).json(ride);
  },
);

router.get("/", async (req, res) => {
  const pagination = parsePagination(req.query);
  const { rows, total } = await getDriverRides(req.user.id, pagination);
  return res.status(200).json(paginatedResponse(rows, total, pagination));
});

router.get("/:id", async (req, res) => {
  const ride = await getRide(req.params.id);

  if (!ride) {
    return res.status(404).json({
      error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
    });
  }

  return res.status(200).json(ride);
});

router.patch(
  "/:id/status",
  validate(updateRideStatusSchema, "Invalid status data."),
  async (req, res) => {
    const updated = await updateRideStatus(req.params.id, req.user.id, req.body.status);

    if (!updated) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Ride not found." },
      });
    }

    return res.status(200).json(updated);
  },
);

export default router;
