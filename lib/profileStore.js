/**
 * Browser-side profile storage: verified email + encryption key + server seal.
 *
 * Uses its own IndexedDB (not the main VoiceRecorderDB) so the key is never part
 * of the sync snapshot, which uploads the whole settings store.
 *
 * Tamper protection: when the OTP is verified the server signs (email + SHA-256 of the key)
 * with a secret only it knows, and returns that "seal". The seal is stored in the DB and in
 * Kahija_Key.txt. Changing the email or the key (in the DB or in the file) invalidates the seal.
 */
const DB_NAME = "KahijaProfileDB";
const STORE   = "profile";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function put(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });
}

function get(db, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = (e) => resolve(e.target.result?.value ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** Returns { email, cryptoKey, seal } — any may be null. */
export async function loadProfile() {
  const db = await open();
  const [email, cryptoKey, seal] = await Promise.all([get(db, "email"), get(db, "cryptoKey"), get(db, "seal")]);
  return { email, cryptoKey, seal };
}

/** Generate an extractable AES-256-GCM key (kept in memory only until the OTP succeeds). */
export function generateProfileKey() {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable, so it can be downloaded
    ["encrypt", "decrypt"]
  );
}

/** Store a verified profile (email, key and the server's seal). */
export async function saveProfile(email, cryptoKey, seal) {
  const db = await open();
  await put(db, "email", email);
  await put(db, "cryptoKey", cryptoKey);
  await put(db, "seal", seal);
}

/** Lower-case hex SHA-256 of the raw key bytes. Sent to the server in place of the key. */
export async function keyFingerprint(cryptoKey) {
  const raw    = await crypto.subtle.exportKey("raw", cryptoKey);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ask the server whether (email, key, seal) is untampered.
 * Returns "valid" | "invalid" | "unreachable" | "unsealed" (no seal at all).
 */
export async function checkProfileIntegrity(email, cryptoKey, seal) {
  if (!seal) return "unsealed";
  try {
    const res = await fetch("/api/profile/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, keyHash: await keyFingerprint(cryptoKey), seal }),
    });
    if (!res.ok) return "unreachable";
    const data = await res.json();
    return data.valid ? "valid" : "invalid";
  } catch {
    return "unreachable";
  }
}

/** Build the text of Kahija_Key.txt (v1.0 — plaintext). */
export function buildKeyFile(email, keyB64, seal) {
  return (
    `Kahija Key File\n` +
    `Version: 1.0\n` +
    `Email: ${email}\n` +
    `Key (base64): ${keyB64}\n` +
    `Seal: ${seal}\n`
  );
}

/**
 * Parse the text of a downloaded Kahija_Key.txt.
 * Supports v1.0 (with Version header) and pre-v1 files (no header) for backward compat.
 * Returns { email, keyB64, seal, version } or throws if the file is not a valid Kahija key file.
 */
export function parseKeyFile(text) {
  const s = String(text);
  const emailM = s.match(/^\s*Email:\s*(\S+)\s*$/im);
  const keyM   = s.match(/^\s*Key \(base64\):\s*([A-Za-z0-9+/=]+)\s*$/im);
  const sealM  = s.match(/^\s*Seal:\s*([A-Za-z0-9_-]+)\s*$/im);
  if (!emailM || !keyM || !sealM) throw new Error("This is not a valid Kahija key file.");
  const versionM = s.match(/^\s*Version:\s*(\S+)\s*$/im);
  const version = versionM ? versionM[1] : "pre-1.0";
  return { email: emailM[1].trim().toLowerCase(), keyB64: keyM[1], seal: sealM[1], version };
}

/** Import a base64 AES-256 key as an extractable AES-GCM CryptoKey. */
export async function importKeyBase64(keyB64) {
  let raw;
  try {
    raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("The key in this file is not valid.");
  }
  if (raw.length !== 32) throw new Error("The key in this file is not valid.");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/**
 * Step 1 of restoring from an uploaded key file: parse it and have the server confirm the seal.
 * Nothing is written. Throws "modified" for an edited/forged file. The caller must then get an
 * OTP for the file's email before calling saveProfile().
 */
export async function prepareRestore(text) {
  const { email, keyB64, seal } = parseKeyFile(text);
  const cryptoKey = await importKeyBase64(keyB64);
  const result = await checkProfileIntegrity(email, cryptoKey, seal);
  if (result === "invalid") {
    throw new Error("This key file has been modified or is not genuine. It was not restored.");
  }
  if (result !== "valid") {
    throw new Error("Could not verify the key file right now. Check your connection and try again.");
  }
  return { email, cryptoKey, seal };
}

function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Export a CryptoKey as a base64 string. */
export async function exportKeyBase64(cryptoKey) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", cryptoKey)));
}

/**
 * Encrypt a JSON-serialisable value with the profile key (AES-256-GCM).
 * Returns base64(iv(12) + ciphertext + tag). The server only ever sees this string.
 */
export async function encryptJson(cryptoKey, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(JSON.stringify(value))
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

/** Inverse of encryptJson(). Throws if the data was encrypted with a different key or was altered. */
export async function decryptJson(cryptoKey, b64) {
  try {
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const pt  = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, cryptoKey, buf.subarray(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new Error("The cloud copy could not be decrypted with your key.");
  }
}
