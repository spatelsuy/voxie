import crypto from "crypto";
import nodemailer from "nodemailer";
import { addOtp, findOtp, removeOtp, RESEND_COOLDOWN_MS, OTP_TTL_MS } from "../../../lib/otpStore";
import { getRegisteredKeyHash } from "../../../lib/emailRegistry";
import { KEY_HASH_RE } from "../../../lib/profileSeal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  // An email that already has a key can't be used to create another one. The only exception is
  // the same key coming back (restore from key file / re-sealing a legacy key): keyHash matches.
  const keyHash = String(req.body?.keyHash || "");
  try {
    const registered = await getRegisteredKeyHash(email);
    if (registered && !(KEY_HASH_RE.test(keyHash) && keyHash === registered)) {
      return res.status(409).json({
        error: "This email is already verified and has a key. Use \"Restore from key file\" with your Kahija_Key.txt instead.",
      });
    }
  } catch (err) {
    console.error("[otp/send] email registry unavailable:", err.message);
    return res.status(500).json({ error: "Could not check this email right now. Please try again." });
  }

  if (!smtpConfigured() && process.env.NODE_ENV === "production") {
    return res.status(500).json({ error: "Email service is not configured." });
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  try {
    const existing = await findOtp(email);
    if (existing && Date.now() - existing.sentAt < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.` });
    }
    await addOtp(email, code);
  } catch (err) {
    console.error("[otp/send] OTP store unavailable:", err.message);
    return res.status(500).json({ error: "Could not create a code right now. Please try again." });
  }

  try {
    if (smtpConfigured()) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `${code} is your Kahija verification code`,
        text:
          `Your Kahija verification code is ${code}.\n\n` +
          `It is valid for ${OTP_TTL_MS / 60000} minutes.\n\n` +
          `If you didn't request this, you can safely ignore this email.`,
        html:
          `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1f2328">` +
          `<p style="margin:0 0 12px;font-size:15px">Your Kahija verification code is:</p>` +
          `<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>` +
          `<p style="margin:0 0 12px;font-size:13px;color:#57606a">This code is valid for ${OTP_TTL_MS / 60000} minutes.</p>` +
          `<p style="margin:0;font-size:12px;color:#8b949e">If you didn't request this, you can safely ignore this email.</p>` +
          `</div>`,
      });
    } else {
      // Development only: no SMTP configured, print the code to the server console.
      console.log(`[otp] DEV MODE — code for ${email}: ${code}`);
    }
    return res.status(200).json({ ok: true, expiresInSec: OTP_TTL_MS / 1000 });
  } catch (err) {
    console.error("[otp/send] failed:", err);
    await removeOtp(email).catch(() => {});
    return res.status(500).json({ error: "Could not send the email. Please try again." });
  }
}
