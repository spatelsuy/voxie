/**
 * OTP store (server side), backed by Supabase so it works across serverless instances.
 *
 * Table schema (run once in the Supabase SQL editor):
 *
 *   create table if not exists otp_codes (
 *     email_hash text primary key,
 *     code_hash  text not null,
 *     sent_at    bigint not null,   -- epoch ms
 *     expires_at bigint not null,   -- epoch ms
 *     attempts   int not null default 0
 *   );
 *
 *   -- No RLS needed: only the service role key is used, server-side.
 *   -- Neither the email nor the code is stored in clear text.
 *
 * Entries returned: { email, sentAt, expiresAt, attempts }. All functions are async.
 */
import { createHash } from "crypto";

export const OTP_TTL_MS         = 5 * 60 * 1000; // valid for 5 minutes
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_ATTEMPTS       = 5;

const sha = (s) => createHash("sha256").update(s).digest("hex");
const emailHash = (email) => sha(`email|${email}`);
const codeHash  = (email, code) => sha(`otp|${email}|${code}`);

function tableUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL env variable is not set");
  return `${url}/rest/v1/otp_codes`;
}

function headers(extra) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY env variable is not set");
  return { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function check(res, what) {
  if (!res.ok) throw new Error(`OTP store ${what} failed: ${res.status} — ${await res.text()}`);
  return res;
}

function toEntry(email, row) {
  return {
    email,
    codeHash: row.code_hash,
    sentAt: Number(row.sent_at),
    expiresAt: Number(row.expires_at),
    attempts: row.attempts,
  };
}

/** Current (unexpired) OTP entry for this email, or null. */
export async function findOtp(email) {
  const res = await check(await fetch(
    `${tableUrl()}?email_hash=eq.${emailHash(email)}&expires_at=gt.${Date.now()}&select=*`,
    { headers: headers() }
  ), "lookup");
  const rows = await res.json();
  return rows?.[0] ? toEntry(email, rows[0]) : null;
}

/** Create (replace) the OTP for this email. Also purges expired rows. */
export async function addOtp(email, code) {
  const now = Date.now();
  await check(await fetch(`${tableUrl()}?expires_at=lt.${now}`, { method: "DELETE", headers: headers() }), "purge");
  await check(await fetch(tableUrl(), {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      email_hash: emailHash(email),
      code_hash:  codeHash(email, code),
      sent_at:    now,
      expires_at: now + OTP_TTL_MS,
      attempts:   0,
    }),
  }), "insert");
}

export async function removeOtp(email) {
  const res = await fetch(`${tableUrl()}?email_hash=eq.${emailHash(email)}`, { method: "DELETE", headers: headers() });
  if (!res.ok && res.status !== 404) await check(res, "delete");
}

/** True if `code` is the code stored in `entry` (as returned by findOtp). */
export function codeMatches(entry, email, code) {
  return entry.codeHash === codeHash(email, code);
}

/**
 * Count one failed attempt. Optimistic concurrency (the update only applies if `attempts` is
 * unchanged), so parallel guesses can't dodge the MAX_ATTEMPTS limit.
 */
export async function recordFailedAttempt(email) {
  for (let i = 0; i < 10; i++) {
    const entry = await findOtp(email);
    if (!entry) return;
    const res = await check(await fetch(
      `${tableUrl()}?email_hash=eq.${emailHash(email)}&attempts=eq.${entry.attempts}`,
      { method: "PATCH", headers: headers({ Prefer: "return=representation" }), body: JSON.stringify({ attempts: entry.attempts + 1 }) }
    ), "update");
    if ((await res.json()).length) return; // our update won
  }
}
