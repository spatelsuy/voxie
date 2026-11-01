import crypto from "crypto";
import nodemailer from "nodemailer";

/**
 * POST { message, replyTo?, website } -> { ok: true }
 *
 * Sends user feedback to the owner's inbox. The destination address lives only in env vars
 * (FEEDBACK_TO, falling back to SMTP_USER) and is never returned to the browser.
 *
 * Spam / abuse controls:
 *   1. Honeypot field ("website") - bots fill it, humans never see it.
 *   2. Size limits on the request body and message.
 *   3. Persistent rate limits in Supabase (works across serverless instances):
 *        per IP per hour, per IP per day, and a global daily cap that protects the Gmail
 *        account (and so the login-code emails) from being suspended.
 *      Only a hash of the IP is stored.
 *
 * Supabase table (run once in the SQL editor):
 *
 *   create table if not exists feedback_log (
 *     id      bigserial primary key,
 *     ip_hash text   not null,
 *     sent_at bigint not null      -- epoch ms
 *   );
 *   create index if not exists feedback_log_ip_idx on feedback_log (ip_hash, sent_at);
 *   create index if not exists feedback_log_sent_idx on feedback_log (sent_at);
 */

export const config = { api: { bodyParser: { sizeLimit: "10kb" } } };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_LEN = 10;
const MAX_LEN = 1000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LIMIT_IP_HOUR = 3;
const LIMIT_IP_DAY = 8;
const LIMIT_GLOBAL_DAY = 100;

function smtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return String(req.headers["x-real-ip"] || fwd || req.socket?.remoteAddress || "unknown");
}

const ipHash = (ip) =>
  crypto.createHash("sha256").update(`feedback|${process.env.KAHIJA_PROFILE_SECRET || ""}|${ip}`).digest("hex");

/* ── Rate limiting ── */

const supabaseConfigured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

function sbHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function sb(path, init, what) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/feedback_log${path}`, init);
  if (!res.ok) throw new Error(`feedback_log ${what} failed: ${res.status} — ${await res.text()}`);
  return res;
}

/** Returns an error message if a limit is hit, otherwise records this send and returns null. */
async function checkAndRecordLimit(hash) {
  const now = Date.now();
  const h = { headers: sbHeaders() };

  const [hourRows, dayRows, globalRows] = await Promise.all([
    sb(`?ip_hash=eq.${hash}&sent_at=gt.${now - HOUR}&select=id&limit=${LIMIT_IP_HOUR}`, h, "hour count").then((r) => r.json()),
    sb(`?ip_hash=eq.${hash}&sent_at=gt.${now - DAY}&select=id&limit=${LIMIT_IP_DAY}`, h, "day count").then((r) => r.json()),
    sb(`?sent_at=gt.${now - DAY}&select=id&limit=${LIMIT_GLOBAL_DAY}`, h, "global count").then((r) => r.json()),
  ]);

  if (hourRows.length >= LIMIT_IP_HOUR || dayRows.length >= LIMIT_IP_DAY) {
    return "You've sent a few messages already. Please try again later.";
  }
  if (globalRows.length >= LIMIT_GLOBAL_DAY) {
    return "We're receiving a lot of feedback right now. Please try again tomorrow.";
  }

  // Purge old rows, then record this send
  await sb(`?sent_at=lt.${now - 2 * DAY}`, { method: "DELETE", headers: sbHeaders() }, "purge");
  await sb("", {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ ip_hash: hash, sent_at: now }),
  }, "insert");
  return null;
}

// Dev fallback when Supabase isn't configured (resets on restart; not for production).
const devLog = new Map();
function devLimit(hash) {
  const now = Date.now();
  const recent = (devLog.get(hash) || []).filter((t) => now - t < HOUR);
  if (recent.length >= LIMIT_IP_HOUR) return "You've sent a few messages already. Please try again later.";
  recent.push(now);
  devLog.set(hash, recent);
  return null;
}

/* ── Handler ── */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Honeypot: pretend success so bots don't adapt
  if (String(req.body?.website || "").trim()) return res.status(200).json({ ok: true });

  const message = String(req.body?.message || "").replace(/\r\n/g, "\n").trim();
  const replyTo = String(req.body?.replyTo || "").trim().toLowerCase();

  if (message.length < MIN_LEN) {
    return res.status(400).json({ error: "Please write a little more so we can help." });
  }
  if (message.length > MAX_LEN) {
    return res.status(400).json({ error: `Please keep your message under ${MAX_LEN} characters.` });
  }
  if (replyTo && (!EMAIL_RE.test(replyTo) || replyTo.length > 254)) {
    return res.status(400).json({ error: "That reply email address doesn't look right." });
  }

  const production = process.env.NODE_ENV === "production";
  if (!smtpConfigured() && production) {
    return res.status(500).json({ error: "Feedback is not available right now." });
  }
  if (!supabaseConfigured() && production) {
    console.error("[feedback] SUPABASE_URL / SUPABASE_SERVICE_KEY not set - refusing to send without rate limiting");
    return res.status(500).json({ error: "Feedback is not available right now." });
  }

  const hash = ipHash(clientIp(req));
  try {
    const limited = supabaseConfigured() ? await checkAndRecordLimit(hash) : devLimit(hash);
    if (limited) return res.status(429).json({ error: limited });
  } catch (err) {
    console.error("[feedback] rate limiter unavailable:", err.message);
    return res.status(500).json({ error: "Could not send your message right now. Please try again." });
  }

  if (!smtpConfigured()) {
    console.log(`[feedback] DEV MODE — ${replyTo || "anonymous"}: ${message}`);
    return res.status(200).json({ ok: true });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const ua = String(req.headers["user-agent"] || "").slice(0, 200);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.FEEDBACK_TO || process.env.SMTP_USER,
      replyTo: replyTo || undefined,
      subject: "Kahija feedback",
      // Plain text only: user content is never rendered as HTML
      text: `${message}\n\n---\nReply-to: ${replyTo || "(not given)"}\nBrowser: ${ua}`,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[feedback] send failed:", err);
    return res.status(500).json({ error: "Could not send your message right now. Please try again." });
  }
}
