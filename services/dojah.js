import axios from "axios";

const DOJAH_APP_ID = process.env.DOJAH_APP_ID;
const DOJAH_PUBLIC_KEY = process.env.DOJAH_PUBLIC_KEY;
const DOJAH_SECRET_KEY = process.env.DOJAH_SECRET_KEY;
const NODE_ENV = process.env.NODE_ENV || "development";
const DOJAH_SANDBOX_BVN = "22222222222"
const DOJAH_SANDBOX_NIN = "70123456789"

/**
 * Structured logging utility for Dojah verification.
 */
function logVerification(level, message, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };
  if (level === "error") {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

// Determine sandbox vs production based on NODE_ENV
const BASE_URL =
  NODE_ENV === "production"
    ? "https://api.dojah.io/api/v1"
    : "https://sandbox.dojah.io/api/v1";

/**
 * Strip the data URI prefix from a base64-encoded image if present.
 * Dojah API expects pure base64 without the "data:image/jpeg;base64," prefix.
 * 
 * @param {string} base64Image - Base64-encoded image, possibly with data URI prefix
 * @returns {string} Pure base64-encoded image
 */
function stripBase64Prefix(base64Image) {
  if (!base64Image) return base64Image;
  return base64Image.replace(/^data:image\/[^;]+;base64,/, "");
}

/**
 * Verify a user's BVN/NIN with a selfie using Dojah API.
 * Uses POST /api/v1/kyc/bvn/verify for BVN or POST /api/v1/kyc/nin/verify for NIN.
 * 
 * @param {Object} params - Verification parameters
 * @param {string} params.bvn - Bank Verification Number (11 digits) — use if verifying BVN
 * @param {string} params.nin - National Identification Number (11 digits) — use if verifying NIN
 * @param {string} params.selfie - Base64-encoded selfie image (with or without data URI prefix)
 * @param {string} [params.firstName] - Optional first name for NIN verification
 * @param {string} [params.lastName] - Optional last name for NIN verification
 * 
 * @returns {Object} Verification result { verified: boolean, ninVerified: boolean, bvnVerified: boolean, dojahResponse: Object }
 */
export async function verifyWithDojah({ bvn, nin, selfie, firstName, lastName }) {
  const startTime = Date.now();

  try {
    // Determine which endpoint to use based on provided identifier
    const isBvnVerification = !!bvn && !nin;
    const isNinVerification = !!nin && !bvn;

    if (!isBvnVerification && !isNinVerification) {
      throw new Error("Either BVN or NIN must be provided, but not both.");
    }

    const endpoint = isBvnVerification ? "/kyc/bvn/verify" : "/kyc/nin/verify";
    const identifier = isBvnVerification ? "bvn" : "nin";

    // Strip data URI prefix from selfie image if present
    const cleanedSelfie = stripBase64Prefix(selfie);

    // Log the verification request
    logVerification("info", "Dojah verification request initiated", {
      identifier,
      value: isBvnVerification ? bvn : nin,
      selfieMetadata: {
        size: cleanedSelfie ? Buffer.byteLength(cleanedSelfie, "base64") : 0,
        isBase64: typeof cleanedSelfie === "string" && cleanedSelfie.length > 0,
      },
      environment: NODE_ENV,
      endpoint: BASE_URL + endpoint,
    });

    // Build request payload based on identifier type
    const payload = {
      [identifier]: isBvnVerification ? DOJAH_SANDBOX_BVN : DOJAH_SANDBOX_NIN,
      selfie_image: cleanedSelfie,
    };

    // Add optional fields for NIN verification
    if (isNinVerification) {
      if (firstName) payload.first_name = firstName;
      if (lastName) payload.last_name = lastName;
    }

    // Make API call to Dojah
    const response = await axios.post(`${BASE_URL}${endpoint}`, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": DOJAH_SECRET_KEY,
        "AppId": DOJAH_APP_ID,
      },
      timeout: 30000, // 30 second timeout
    });

    const elapsedTime = Date.now() - startTime;

    // Log the successful response
    logVerification("info", "Dojah verification response received", {
      identifier,
      statusCode: response.status,
      elapsedTimeMs: elapsedTime,
      entity: response.data?.entity ? {
        [identifier]: response.data.entity[identifier],
        selfie_verification: response.data.entity.selfie_verification,
      } : null,
    });

    // Parse verification results from Dojah response
    // Response structure: { entity: { bvn/nin: "...", selfie_verification: { match: true, confidence_value: 99.99 } } }
    const entity = response.data?.entity;
    if (!entity) {
      throw new Error("Invalid response from Dojah: missing entity");
    }

    const selfieVerification = entity.selfie_verification || {};
    const verified = selfieVerification.match === true;
    const ninVerified = isNinVerification && verified;
    const bvnVerified = isBvnVerification && verified;

    return {
      verified,
      ninVerified,
      bvnVerified,
      dojahResponse: response.data,
    };
  } catch (error) {
    const elapsedTime = Date.now() - startTime;

    // Log the error (but don't throw - signup should still succeed in development)
    logVerification("error", "Dojah verification failed", {
      elapsedTimeMs: elapsedTime,
      errorMessage: error.message,
      errorCode: error.code,
      errorResponse: error.response?.data || null,
      statusCode: error.response?.status || null,
    });

    // Return failed verification (for development, signup will still proceed)
    return {
      verified: false,
      ninVerified: false,
      bvnVerified: false,
      dojahResponse: {
        error: error.message,
        success: false,
      },
    };
  }
}

/**
 * Verify a user as a driver using their driver's license and selfie via Dojah API.
 * Uses the Face-Doc Compare endpoint to match selfie against the driver's license.
 * 
 * @param {Object} params - Verification parameters
 * @param {string} params.driverLicense - Base64-encoded driver's license image
 * @param {string} params.selfie - Base64-encoded selfie image
 * 
 * @returns {Object} Verification result { verified: boolean, confidenceValue: number, dojahResponse: Object }
 */
export async function verifyDriverWithDojah({ driverLicense, selfie }) {
  const startTime = Date.now();
  const PHOTOID_ENDPOINT = "/kyc/photoid/verify";

  try {
    // Log the verification request
    logVerification("info", "Dojah driver verification request initiated", {
      driverLicenseMetadata: {
        size: driverLicense ? Buffer.byteLength(driverLicense, "base64") : 0,
        isBase64: typeof driverLicense === "string" && driverLicense.length > 0,
      },
      selfieMetadata: {
        size: selfie ? Buffer.byteLength(selfie, "base64") : 0,
        isBase64: typeof selfie === "string" && selfie.length > 0,
      },
      environment: NODE_ENV,
      endpoint: BASE_URL + PHOTOID_ENDPOINT,
    });

    // Build request payload for face-doc-compare
    const payload = {
      photoid_image: driverLicense, // Base64-encoded driver's license
      selfie_image: selfie, // Base64-encoded selfie
    };

    // Make API call to Dojah face-doc-compare endpoint
    const response = await axios.post(`${BASE_URL}${PHOTOID_ENDPOINT}`, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": DOJAH_SECRET_KEY,
        "AppId": DOJAH_APP_ID,
      },
      timeout: 30000, // 30 second timeout
    });

    const elapsedTime = Date.now() - startTime;

    // Log the response
    logVerification("info", "Dojah driver verification response received", {
      statusCode: response.status,
      elapsedTimeMs: elapsedTime,
      matchResult: response.data?.entity?.selfie?.match,
      confidenceValue: response.data?.entity?.selfie?.confidence_value,
      cardType: response.data?.entity?.selfie?.card_type,
      dojahResponse: response.data,
    });

    // Parse verification results from the face-doc-compare response
    const selfieData = response.data?.entity?.selfie;
    const verified = selfieData?.match === true;
    const confidenceValue = selfieData?.confidence_value || 0;

    return {
      verified,
      confidenceValue,
      dojahResponse: response.data,
    };
  } catch (error) {
    const elapsedTime = Date.now() - startTime;

    // Log the error
    logVerification("error", "Dojah driver verification failed", {
      elapsedTimeMs: elapsedTime,
      errorMessage: error.message,
      errorCode: error.code,
      errorResponse: error.response?.data || null,
      statusCode: error.response?.status || null,
    });

    return {
      verified: false,
      confidenceValue: 0,
      dojahResponse: {
        error: error.message,
        success: false,
      },
    };
  }
}
export function validateDojahConfig() {
  if (!DOJAH_APP_ID || !DOJAH_PUBLIC_KEY || !DOJAH_SECRET_KEY) {
    logVerification("warn", "Dojah configuration incomplete", {
      hasAppId: !!DOJAH_APP_ID,
      hasPublicKey: !!DOJAH_PUBLIC_KEY,
      hasSecretKey: !!DOJAH_SECRET_KEY,
    });
  }
}
