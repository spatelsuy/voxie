import nodemailer from "nodemailer";
import { checkSeal, KEY_HASH_RE } from "../../../lib/profileSeal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ICS_CHARS = 500000;
const MAX_RECIPIENTS = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_SENDS = 10;

// Best-effort per-sender limit (in-memory: resets on restart, per serverless instance).
const sendLog = new Map();

function rateLimited(sender) {
  const now = Date.now();
  const recent = (sendLog.get(sender) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_SENDS) {
    sendLog.set(sender, recent);
    return true;
  }
  recent.push(now);
  sendLog.set(sender, recent);
  return false;
}

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * POST { email, keyHash, seal, ics, count, includeSelf, to: string[] } -> { ok: true, sentTo: string[] }
 *
 * Emails the .ics file as an attachment to the user's verified profile email (optional)
 * and/or up to MAX_RECIPIENTS additional addresses. The seal proves the sender completed
 * OTP verification, so anonymous callers cannot use this endpoint to send mail.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email       = String(req.body?.email || "").trim().toLowerCase();
  const keyHash     = String(req.body?.keyHash || "");
  const seal        = String(req.body?.seal || "");
  const ics         = String(req.body?.ics || "");
  const count       = Number(req.body?.count) || 0;
  const includeSelf = req.body?.includeSelf !== false;
  const extra       = Array.isArray(req.body?.to) ? req.body.to : [];

  if (!email || !KEY_HASH_RE.test(keyHash) || !seal) {
    return res.status(403).json({ error: "Verify your email in Profile first." });
  }
  try {
    if (!checkSeal(email, keyHash, seal)) {
      return res.status(403).json({ error: "Your profile could not be verified." });
    }
  } catch (err) {
    console.error("[export/email-ics] cannot check seal:", err.message);
    return res.status(500).json({ error: "Server is not configured to check profiles." });
  }

  const recipients = new Set();
  if (includeSelf) recipients.add(email);
  for (const raw of extra) {
    const addr = String(raw || "").trim().toLowerCase();
    if (!EMAIL_RE.test(addr) || addr.length > 254) {
      return res.status(400).json({ error: `"${String(raw).slice(0, 60)}" is not a valid email address.` });
    }
    recipients.add(addr);
  }
  if (recipients.size === 0) {
    return res.status(400).json({ error: "Enter at least one recipient." });
  }
  if (recipients.size > MAX_RECIPIENTS) {
    return res.status(400).json({ error: `You can send to at most ${MAX_RECIPIENTS} recipients at a time.` });
  }

  if (!ics.startsWith("BEGIN:VCALENDAR") || ics.length > MAX_ICS_CHARS) {
    return res.status(400).json({ error: "Invalid calendar file." });
  }

  if (rateLimited(email)) {
    return res.status(429).json({ error: "Too many emails sent. Please try again later." });
  }

  const sentTo = [...recipients];

  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return res.status(500).json({ error: "Email service is not configured." });
    }
    console.log(`[export/email-ics] DEV MODE — would email ICS (${ics.length} chars) to ${sentTo.join(", ")}`);
    return res.status(200).json({ ok: true, sentTo });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const what = count ? `${count} activit${count !== 1 ? "ies" : "y"}` : "activities";
    // One message per recipient so addresses are not exposed to each other.
    await Promise.all(
      sentTo.map((to) =>
        transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to,
          replyTo: to === email ? undefined : email,
          subject: "Kahija activities (.ics)",
          text:
            `${email} shared ${what} with you from Kahija.\n\n` +
            `The attached calendar file (.ics) can be opened to import into Outlook, Apple Calendar or Google Calendar.`,
          attachments: [
            {
              filename: "kahija-activities.ics",
              content: ics,
              contentType: "text/calendar; charset=utf-8; method=PUBLISH",
            },
          ],
        })
      )
    );
    return res.status(200).json({ ok: true, sentTo });
  } catch (err) {
    console.error("[export/email-ics] failed:", err);
    return res.status(500).json({ error: "Could not send the email. Please try again." });
  }
}
