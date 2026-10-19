/**
 * Server-side registry of emails that have already been issued an encryption key (Supabase).
 *
 * Table schema (run once in the Supabase SQL editor):
 *
 *   create table if not exists verified_emails (
 *     email_hash  text primary key,
 *     key_hash    text not null,
 *     verified_at timestamptz not null default now()
 *   );
 *
 *   -- No RLS needed: only the service role key is used, server-side.
 *   -- email_hash = sha256(lower-case email), so the raw address is never stored.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY (same as the sync backend).
 */
import { createHash } from "crypto";

function emailHash(email) {
  return createHash("sha256").update(email).digest("hex");
}

function tableUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL env variable is not set");
  return `${url}/rest/v1/verified_emails`;
}

function headers() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY env variable is not set");
  return {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

/** Returns the key fingerprint registered for this email, or null if the email is not registered. */
export async function getRegisteredKeyHash(email) {
  const res = await fetch(`${tableUrl()}?email_hash=eq.${emailHash(email)}&select=key_hash`, { headers: headers() });
  if (!res.ok) throw new Error(`Email registry lookup failed: ${res.status} — ${await res.text()}`);
  const rows = await res.json();
  return rows?.[0]?.key_hash ?? null;
}

/**
 * Atomically register an email. Returns true if this call claimed it,
 * false if the email was already registered (primary-key conflict).
 */
export async function claimEmail(email, keyHash) {
  const res = await fetch(tableUrl(), {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify({ email_hash: emailHash(email), key_hash: keyHash }),
  });
  if (res.ok) return true;
  if (res.status === 409) return false;
  throw new Error(`Email registry insert failed: ${res.status} — ${await res.text()}`);
}
