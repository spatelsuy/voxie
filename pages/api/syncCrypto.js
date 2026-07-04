/**
 * syncCrypto.js — AES-256-GCM encryption helpers for sync payload.
 *
 * Key derivation:
 *   key = HKDF-SHA256( secret: sub + ":" + KAHIJA_SYNC_SALT, info: "kahija-sync-v1" )
 *
 * The key is derived entirely server-side. It is never sent to the browser.
 * Same user on any device → same sub → same key → can decrypt each other's data.
 */

import { createHmac, hkdfSync, randomBytes,
         createCipheriv, createDecipheriv } from "crypto";

const ALGO      = "aes-256-gcm";
const KEY_LEN   = 32;   // 256 bits
const IV_LEN    = 12;   // 96 bits — GCM standard
const TAG_LEN   = 16;   // 128 bits auth tag
const HKDF_INFO = Buffer.from("kahija-sync-v1");
const HKDF_SALT = Buffer.alloc(32, 0); // fixed zero salt — entropy comes from ikm

/**
 * Derive a 256-bit AES key from the user's Google sub + app salt.
 * @param {string} sub  — Google JWT `sub` claim (unique user ID)
 * @returns {Buffer}    — 32-byte key
 */
export function deriveKey(sub) {
  const appSalt = process.env.KAHIJA_SYNC_SALT;
  if (!appSalt) throw new Error("KAHIJA_SYNC_SALT env variable is not set");
  const ikm = Buffer.from(`${sub}:${appSalt}`, "utf8");
  return Buffer.from(hkdfSync("sha256", ikm, HKDF_SALT, HKDF_INFO, KEY_LEN));
}

/**
 * Encrypt a plain JS object.
 * @returns {string}  base64-encoded string: iv(12) + ciphertext + tag(16)
 */
export function encrypt(key, obj) {
  const iv         = randomBytes(IV_LEN);
  const cipher     = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const plaintext  = Buffer.from(JSON.stringify(obj), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag        = cipher.getAuthTag();
  // Pack: iv | ciphertext | tag
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

/**
 * Decrypt a base64 string produced by encrypt().
 * @returns {object}  parsed JS object
 */
export function decrypt(key, b64) {
  const buf        = Buffer.from(b64, "base64");
  const iv         = buf.subarray(0, IV_LEN);
  const tag        = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher   = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const plaintext  = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
