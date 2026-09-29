import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

export interface RateLimitConfig {
  maxRequests: number; // e.g. 30 requests
  windowSeconds: number; // e.g. 3600 (1 hour)
}

/**
 * Enforces atomic fixed-window rate limiting per device using Firestore transactions.
 */
export async function checkRateLimit(
  deviceId: string,
  functionName: string,
  config: RateLimitConfig
): Promise<void> {
  const db = admin.firestore();
  const safeId = deviceId.replace(/[^a-zA-Z0-9_-]/g, "");
  const docRef = db.collection("rate_limits").doc(`${safeId}_${functionName}`);

  const now = admin.firestore.Timestamp.now();
  const nowMs = now.toMillis();
  const windowDurationMs = config.windowSeconds * 1000;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(docRef);

    if (!snap.exists) {
      transaction.set(docRef, {
        count: 1,
        windowStart: now,
      });
      return;
    }

    const data = snap.data()!;
    const windowStart = data.windowStart as admin.firestore.Timestamp;
    const windowStartMs = windowStart ? windowStart.toMillis() : nowMs;
    const elapsedMs = nowMs - windowStartMs;

    if (elapsedMs > windowDurationMs) {
      // Window expired; reset window and counter
      transaction.set(docRef, {
        count: 1,
        windowStart: now,
      });
    } else {
      if (data.count >= config.maxRequests) {
        const retryAfterSeconds = Math.ceil((windowDurationMs - elapsedMs) / 1000);
        throw new HttpsError(
          "resource-exhausted",
          `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`
        );
      }

      transaction.update(docRef, {
        count: admin.firestore.FieldValue.increment(1),
      });
    }
  });
}
