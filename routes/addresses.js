import { Router } from "express";
import { searchAddressSchema } from "../validationSchemas/addresses.js";

const router = Router();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

router.get("/search", async (req, res) => {
  const { address } = req.query;

  const parsed = searchAddressSchema.safeParse({ address });
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Address query parameter is required." },
    });
  }

  const params = new URLSearchParams({
    query: `${address}, Lagos, Nigeria`,
    key: GOOGLE_API_KEY,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
  );

  if (!response.ok) {
    return res.status(502).json({
      error: { code: "UPSTREAM_ERROR", message: "Failed to fetch address data." },
    });
  }

  const data = await response.json();

  if (data.status !== "OK") {
    return res.status(502).json({
      error: { code: "UPSTREAM_ERROR", message: `Google Places error: ${data.status}` },
    });
  }

  const results = data.results.map(({ formatted_address, geometry, place_id }) => ({
    display_name: formatted_address,
    lat: geometry.location.lat,
    lon: geometry.location.lng,
    place_id,
  }));

  return res.status(200).json(results);
});

export default router;
