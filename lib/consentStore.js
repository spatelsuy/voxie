/**
 * Browser-side consent storage (IndexedDB).
 *
 * Stores { version, acceptedAt } so the app can detect when the user
 * accepted an older version of the Privacy Policy and re-prompt them.
 *
 * Uses the same KahijaProfileDB as profileStore so there is only one DB.
 */
const DB_NAME = "KahijaProfileDB";
const STORE   = "profile";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
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

/**
 * Returns { version, acceptedAt } if the user has accepted any version,
 * or null if they have never accepted.
 */
export async function loadConsent() {
  const db = await open();
  const version    = await get(db, "consent_version");
  const acceptedAt = await get(db, "consent_accepted_at");
  if (!version) return null;
  return { version, acceptedAt };
}

/**
 * Persist acceptance of a specific policy version in the browser.
 * @param {string} version  e.g. "v20250701"
 */
export async function saveConsent(version) {
  const db         = await open();
  const acceptedAt = new Date().toISOString();
  await put(db, "consent_version",     version);
  await put(db, "consent_accepted_at", acceptedAt);
  return { version, acceptedAt };
}
