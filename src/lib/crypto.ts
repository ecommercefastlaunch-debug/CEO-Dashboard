import crypto from "node:crypto";

// Secrets at rest (channel API keys, signing secrets) are AES-256-GCM encrypted
// with a key derived from SESSION_SECRET. Rotating SESSION_SECRET means the
// channel secrets have to be entered again.

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is missing or too short (16+ characters).");
  return crypto.createHash("sha256").update(`erp:secret:${s}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(":");
  if (!ivB || !tagB || !dataB) throw new Error("Malformed ciphertext.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

/** A URL-safe random token. */
export function newToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Constant-time string compare. False for anything missing. */
export function safeEqual(expected: string | null | undefined, given: string | null | undefined): boolean {
  if (!expected || typeof given !== "string" || given.length === 0) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
