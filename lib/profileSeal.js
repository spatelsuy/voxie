import crypto from "crypto";

/**
 * Profile seal: an HMAC, signed with a server-only secret, that binds an email to the
 * SHA-256 fingerprint of that user's encryption key. The key itself never reaches the server.
 *
 * The seal is stateless, so it works across serverless instances.
 * NEVER change or lose KAHIJA_PROFILE_SECRET: every existing key file / browser profile
 * would stop verifying.
 */
const VERSION = "kahija-profile-v1";

function secret() {
  const s = process.env.KAHIJA_PROFILE_SECRET;
  if (!s) throw new Error("KAHIJA_PROFILE_SECRET is not set");
  return s;
}

export function makeSeal(email, keyHash) {
  return crypto
    .createHmac("sha256", secret())
    .update(`${VERSION}|${email}|${keyHash}`)
    .digest("base64url");
}

export function checkSeal(email, keyHash, seal) {
  const expected = Buffer.from(makeSeal(email, keyHash));
  const given    = Buffer.from(String(seal || ""));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

export const KEY_HASH_RE = /^[0-9a-f]{64}$/;
