import { findOtp, removeOtp, codeMatches, recordFailedAttempt, MAX_ATTEMPTS } from "../../../lib/otpStore";
import { makeSeal, checkSeal, KEY_HASH_RE } from "../../../lib/profileSeal";
import { getRegisteredKeyHash, claimEmail } from "../../../lib/emailRegistry";

const ALREADY_USED =
  "This email is already verified and has a key. Use \"Restore from key file\" with your Kahija_Key.txt instead.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email   = String(req.body?.email || "").trim().toLowerCase();
  const otp     = String(req.body?.otp || "").trim();
  const keyHash = String(req.body?.keyHash || "");
  const restoreSeal = req.body?.restoreSeal ? String(req.body.restoreSeal) : null; // set when restoring from a key file

  if (!KEY_HASH_RE.test(keyHash)) {
    return res.status(400).json({ error: "Missing key fingerprint." });
  }

  // Restoring from a file: the server itself re-checks the file's seal, so a tampered
  // file can never be turned into a profile, even by a client that skips its own check.
  if (restoreSeal) {
    let genuine = false;
    try { genuine = checkSeal(email, keyHash, restoreSeal); }
    catch (err) {
      console.error("[otp/verify] cannot check seal:", err.message);
      return res.status(500).json({ error: "Server is not configured to secure profiles." });
    }
    if (!genuine) {
      return res.status(400).json({ error: "This key file has been modified or is not genuine. It was not restored." });
    }
  }

  try {
    const entry = await findOtp(email); // expired entries are never returned
    if (!entry) {
      return res.status(400).json({ error: "Code expired or not found. Request a new one." });
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
      await removeOtp(email);
      return res.status(429).json({ error: "Too many attempts. Request a new code." });
    }

    if (!codeMatches(entry, email, otp)) {
      await recordFailedAttempt(email);
      return res.status(400).json({ error: "Incorrect code." });
    }
  } catch (err) {
    console.error("[otp/verify] OTP store unavailable:", err.message);
    return res.status(500).json({ error: "Could not check the code right now. Please try again." });
  }

  // Sign before consuming the code, so a server misconfiguration doesn't burn the user's OTP.
  let seal;
  try {
    seal = makeSeal(email, keyHash);
  } catch (err) {
    console.error("[otp/verify] cannot create seal:", err.message);
    return res.status(500).json({ error: "Server is not configured to secure profiles." });
  }

  // Register the email (atomic). If it already has a different key, refuse to issue another.
  try {
    let ok = await claimEmail(email, keyHash);
    if (!ok) ok = (await getRegisteredKeyHash(email)) === keyHash; // same key coming back is fine
    if (!ok) {
      await removeOtp(email);
      return res.status(409).json({ error: ALREADY_USED });
    }
  } catch (err) {
    console.error("[otp/verify] email registry unavailable:", err.message);
    return res.status(500).json({ error: "Could not verify this email right now. Please try again." });
  }

  // Single use. If this delete fails the code just expires on its own; the email is already registered.
  await removeOtp(email).catch((err) => console.error("[otp/verify] could not delete used OTP:", err.message));
  return res.status(200).json({ ok: true, seal });
}
