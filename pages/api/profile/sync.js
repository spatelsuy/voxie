import { checkSeal, KEY_HASH_RE } from "../../../lib/profileSeal";
import { supabaseUpload, supabaseDownload, supabaseDelete } from "../supabaseSync";

/**
 * POST { action: "get" | "put" | "delete", email, keyHash, seal, payload? }
 *
 * Stores the user's sync snapshot in the sync_data table, keyed by their verified email.
 * The payload is already encrypted in the browser with the user's Kahija key; the server
 * cannot read it. Access is granted only to a caller that presents a valid seal for
 * (email, keyHash), which only this server can create (at OTP verification).
 */
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const PAYLOAD_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email   = String(req.body?.email || "").trim().toLowerCase();
  const keyHash = String(req.body?.keyHash || "");
  const seal    = String(req.body?.seal || "");
  const action  = req.body?.action;

  if (!email || !KEY_HASH_RE.test(keyHash) || !seal) {
    return res.status(400).json({ error: "Missing profile details." });
  }

  let genuine = false;
  try {
    genuine = checkSeal(email, keyHash, seal);
  } catch (err) {
    console.error("[profile/sync] cannot check seal:", err.message);
    return res.status(500).json({ error: "Server is not configured to check profiles." });
  }
  if (!genuine) return res.status(403).json({ error: "Your profile could not be verified." });

  // Distinct from Google-sign-in rows: those are keyed by a numeric Google ID.
  const owner = `email:${email}`;

  try {
    if (action === "get") {
      return res.status(200).json({ payload: await supabaseDownload(owner) });
    }
    if (action === "put") {
      const payload = req.body?.payload;
      if (typeof payload !== "string" || !PAYLOAD_RE.test(payload)) {
        return res.status(400).json({ error: "Invalid data." });
      }
      await supabaseUpload(owner, payload);
      return res.status(200).json({ ok: true });
    }
    if (action === "delete") {
      await supabaseDelete(owner);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    console.error("[profile/sync] storage error:", err.message);
    return res.status(500).json({ error: "Could not reach cloud storage. Please try again." });
  }
}
