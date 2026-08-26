const PAYSTACK_BASE_URL = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

export class PaystackError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "PaystackError";
    this.status = status;
    this.body = body;
  }
}

export function requireSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not set. Copy .env.example to .env and fill it in.",
    );
  }
  return secretKey;
}

export async function paystackRequest(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${requireSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new PaystackError(`Could not reach Paystack: ${err.message}`);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body — fall through to the generic error below.
  }

  if (!response.ok || !payload?.status) {
    throw new PaystackError(payload?.message || `Paystack request failed with status ${response.status}.`, {
      status: response.status,
      body: payload,
    });
  }
  return payload.data;
}
