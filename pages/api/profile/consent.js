/**
 * POST { email, termsVersion, acceptedAt, seal, keyHash }
 *
 * Records the user's privacy policy acceptance in the verified_emails table.
 * Requires a valid profile seal so only a verified user can call this.
 * Safe to call even if the user is not yet verified — the PATCH is a no-op
 * for an email that doesn't exist in the table yet.
 */
import { checkSeal, KEY_HASH_RE } from "../../../lib/profileSeal";
import { saveConsent } from "../../../lib/emailRegistry";

const VERSION_RE = /^v\d{8}$/; // e.g. v20250701

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email        = String(req.body?.email        || "").trim().toLowerCase();
  const termsVersion = String(req.body?.termsVersion || "");
  const acceptedAt   = String(req.body?.acceptedAt   || "");
  const seal         = String(req.body?.seal         || "");
  const keyHash      = String(req.body?.keyHash      || "");

  if (!email || !VERSION_RE.test(termsVersion) || !acceptedAt) {
    return res.status(400).json({ error: "Missing or invalid fields." });
  }

  // Seal + keyHash are optional — anonymous users have no profile yet.
  // If provided, verify them; if not, skip cloud save (local-only consent).
  if (seal && keyHash) {
    if (!KEY_HASH_RE.test(keyHash)) {
      return res.status(400).json({ error: "Invalid key fingerprint." });
    }
    let genuine = false;
    try {
      genuine = checkSeal(email, keyHash, seal);
    } catch (err) {
      console.error("[profile/consent] cannot check seal:", err.message);
      return res.status(500).json({ error: "Server is not configured to check profiles." });
    }
    if (!genuine) return res.status(403).json({ error: "Profile could not be verified." });

    try {
      await saveConsent(email, termsVersion, acceptedAt);
    } catch (err) {
      console.error("[profile/consent] saveConsent failed:", err.message);
      // Non-fatal — local IndexedDB save already happened in the browser.
      return res.status(200).json({ ok: true, cloudSaved: false });
    }
    return res.status(200).json({ ok: true, cloudSaved: true });
  }

  // No seal — anonymous user, local-only consent. Nothing to save server-side.
  return res.status(200).json({ ok: true, cloudSaved: false });
}
