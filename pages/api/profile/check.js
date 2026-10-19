import { checkSeal, KEY_HASH_RE } from "../../../lib/profileSeal";

/** POST { email, keyHash, seal } -> { valid: boolean }. Stateless: recomputes the HMAC. */
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email   = String(req.body?.email || "").trim().toLowerCase();
  const keyHash = String(req.body?.keyHash || "");
  const seal    = String(req.body?.seal || "");

  if (!email || !KEY_HASH_RE.test(keyHash) || !seal) {
    return res.status(200).json({ valid: false });
  }

  try {
    return res.status(200).json({ valid: checkSeal(email, keyHash, seal) });
  } catch (err) {
    console.error("[profile/check] cannot check seal:", err.message);
    return res.status(500).json({ error: "Server is not configured to check profiles." });
  }
}
