import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listPaymentsForUser } from "../db/payments.repo.js";
import { serializePayment } from "../utils/serializers.js";
import { PaystackError } from "../utils/paystack.js";
import {
  processWebhookEvent,
  verifyPayment,
  verifyWebhookSignature,
} from "../services/payments.service.js";

const router = Router();

// Paystack checkout is only ever started by the booking endpoints (rides and
// rentals) — amounts are server-computed there, so there is no standalone
// initialize endpoint. This router handles settlement: the webhook, owner
// verification, and payment history.
router.post("/webhook", async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  if (!verifyWebhookSignature(req.rawBody, signature)) {
    return res.status(401).json({
      error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." },
    });
  }

  await processWebhookEvent(req.body);
  return res.status(200).end();
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  const payments = await listPaymentsForUser(req.user.id);
  return res.status(200).json(payments.map(serializePayment));
});

router.get("/verify/:reference", async (req, res) => {
  try {
    const payment = await verifyPayment(req.params.reference, req.user.id);
    if (!payment) {
      return res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Payment not found." },
      });
    }
    return res.status(200).json(serializePayment(payment));
  } catch (err) {
    if (err instanceof PaystackError) {
      return res.status(502).json({
        error: { code: "GATEWAY_ERROR", message: err.message },
      });
    }
    throw err;
  }
});

export default router;
