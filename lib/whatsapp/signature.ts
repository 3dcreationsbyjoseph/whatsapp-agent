// Verificación de la firma X-Hub-Signature-256 que Meta envía en cada webhook.
// La firma es HMAC-SHA256 del raw body con el APP SECRET de la app de Meta.

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expectedSig = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const hmac = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(hmac, "hex"));
  } catch {
    return false;
  }
}
