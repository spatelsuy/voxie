/**
 * supabaseSync.js — Supabase storage backend for kahija sync.
 *
 * Table schema (run once in Supabase SQL editor):
 *
 *   create table if not exists sync_data (
 *     user_hash  text primary key,
 *     payload    text not null,
 *     updated_at timestamptz not null default now()
 *   );
 *
 *   -- No RLS needed — we use the service role key server-side only.
 *   -- user_hash = sha256(sub) so the raw Google ID is never stored.
 *
 * Env vars required:
 *   SUPABASE_URL           — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY   — service role secret key (never expose to browser)
 */

import { createHash } from "crypto";

/** sha256(sub) — never store the raw Google ID in Supabase */
function userHash(sub) {
  return createHash("sha256").update(sub).digest("hex");
}

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_KEY env variable is not set");
  return {
    "Content-Type":  "application/json",
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Prefer":        "return=minimal",
  };
}

function tableUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL env variable is not set");
  return `${url}/rest/v1/sync_data`;
}

/** Upload (upsert) encrypted payload to Supabase */
export async function supabaseUpload(sub, encryptedPayload) {
  const hash = userHash(sub);
  const res  = await fetch(tableUrl(), {
    method:  "POST",
    headers: {
      ...supabaseHeaders(),
      "Prefer": "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_hash:  hash,
      payload:    encryptedPayload,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase upload failed: ${res.status} — ${text}`);
  }
}

/** Download encrypted payload from Supabase, or null if not found */
export async function supabaseDownload(sub) {
  const hash   = userHash(sub);
  const url    = `${tableUrl()}?user_hash=eq.${encodeURIComponent(hash)}&select=payload`;
  const res    = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase download failed: ${res.status} — ${text}`);
  }
  const rows = await res.json();
  return rows?.[0]?.payload || null;
}

/** Delete the row from Supabase */
export async function supabaseDelete(sub) {
  const hash = userHash(sub);
  const url  = `${tableUrl()}?user_hash=eq.${encodeURIComponent(hash)}`;
  const res  = await fetch(url, { method: "DELETE", headers: supabaseHeaders() });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Supabase delete failed: ${res.status} — ${text}`);
  }
}
