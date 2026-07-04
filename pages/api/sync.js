/**
 * /api/sync — Unified sync handler for kahija-sync data.
 *
 * Supports two storage backends, selected via ?backend=drive|supabase
 * (defaults to "drive" if not specified).
 *
 * All payloads are AES-256-GCM encrypted before storage and decrypted on read.
 * The encryption key is derived server-side from the user's Google sub + app salt.
 * The key never touches the browser.
 *
 * GET    /api/sync?backend=drive|supabase  → download + decrypt snapshot
 * POST   /api/sync?backend=drive|supabase  → encrypt + upload snapshot
 * DELETE /api/sync?backend=drive|supabase  → clear stored file (testing)
 */

import { getToken }                              from "next-auth/jwt";
import { deriveKey, encrypt, decrypt }           from "./syncCrypto";
import { supabaseUpload, supabaseDownload,
         supabaseDelete }                        from "./supabaseSync";

const DRIVE_FILES_URL  = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_NAME        = "kahija-sync.json";

/* ─── Token helpers ───────────────────────────────── */

async function getTokenData(req) {
  return getToken({ req, secret: process.env.NEXTAUTH_SECRET });
}

/* ─── Drive helpers ───────────────────────────────── */

async function listAllAppDataFolderContents(accessToken) {
  const params = new URLSearchParams({
    spaces: "appDataFolder", // Look strictly in the hidden folder
    // ✅ CHANGED: "files(*)" fetches ALL attributes (size, mimeType, modifiedTime, etc.)
    fields: "files(*)", 
    // ✅ REMOVED: No 'q' parameter here so it lists ALL files, not just your specific FILE_NAME
    pageSize: "100" 
  });

  console.log(`${DRIVE_FILES_URL}?${params}`);
  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Diagnostic list error:", JSON.stringify(body));
    throw new Error(`Drive list failed: ${res.status}`);
  }

  const body = await res.json();
  
  // This will print the full structural array of objects directly in your terminal
  console.log("=== FULL APP DATA FOLDER CONTENT CONSOLE DUMP ===");
  console.log(JSON.stringify(body.files, null, 2));
  console.log("==================================================");

  return body.files || [];
}


async function findDriveFileId(accessToken) {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id,name)",
    q:      `name='${FILE_NAME}'`,
  });
  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("Drive list error body:", JSON.stringify(body));
    throw new Error(`Drive list failed: ${res.status} — ${body?.error?.message || "unknown"}`);
  }
  const body = await res.json();
  return body.files?.[0]?.id || null;
}

async function downloadDriveRaw(accessToken, fileId) {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  // File contains a JSON object with an "encrypted" string field
  return res.json();
}

async function uploadDrive(accessToken, fileId, payload) {
  const metadata = {
    name: FILE_NAME,
    ...(fileId ? {} : { parents: ["appDataFolder"] }),
  };
  const boundary = "---kahija_boundary_001";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(payload) +
    `\r\n--${boundary}--`;

  const url    = fileId
    ? `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
  const method = fileId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed: ${res.status} — ${text}`);
  }
  return res.json();
}

async function deleteDriveFile(accessToken, fileId) {
  const res = await fetch(`${DRIVE_FILES_URL}/${fileId}`, {
    method:  "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204)
    throw new Error(`Drive delete failed: ${res.status}`);
}

/* ─── Main handler ────────────────────────────────── */

export default async function handler(req, res) {
  const tokenData = await getTokenData(req);
  if (!tokenData) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sub         = tokenData.sub;
  const accessToken = tokenData.accessToken;
  const backend     = req.query.backend === "supabase" ? "supabase" : "drive";

  // Derive encryption key from user sub + app salt (server-side only)
  let key;
  try {
    key = deriveKey(sub);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  try {
    /* ── GET: Download + decrypt ──────────────────── */
    if (req.method === "GET") {
      if (backend === "supabase") {
        const ciphertext = await supabaseDownload(sub);
        if (!ciphertext) return res.status(404).json({ error: "No sync data found" });
        const data = decrypt(key, ciphertext);
        return res.status(200).json(data);

      } else {
        if (!accessToken) return res.status(401).json({ error: "No access token" });
        const fileId = await findDriveFileId(accessToken);
        if (!fileId) return res.status(404).json({ error: "No sync file found" });
        const envelope = await downloadDriveRaw(accessToken, fileId);
        const data     = decrypt(key, envelope.encrypted);
        return res.status(200).json(data);
      }

    /* ── POST: Encrypt + upload ───────────────────── */
    } else if (req.method === "POST") {
      const snapshot = req.body;
      if (!snapshot || typeof snapshot !== "object") {
        return res.status(400).json({ error: "Invalid body" });
      }
      const ciphertext = encrypt(key, snapshot);

      if (backend === "supabase") {
        await supabaseUpload(sub, ciphertext);
        return res.status(200).json({ ok: true });

      } else {
        if (!accessToken) return res.status(401).json({ error: "No access token" });
        const fileId = await findDriveFileId(accessToken);
        const result = await uploadDrive(accessToken, fileId, { encrypted: ciphertext });
        return res.status(200).json({ ok: true, fileId: result.id });
      }

    /* ── DELETE: Clear stored data ────────────────── */
    } else if (req.method === "DELETE") {
      if (backend === "supabase") {
        await supabaseDelete(sub);
        return res.status(200).json({ ok: true, message: "Supabase record deleted" });

      } else {
        if (!accessToken) return res.status(401).json({ error: "No access token" });
        //await listAllAppDataFolderContents(accessToken);
        const fileId = await findDriveFileId(accessToken);
        if (!fileId) return res.status(200).json({ ok: true, message: "No file to delete" });
        await deleteDriveFile(accessToken, fileId);
        return res.status(200).json({ ok: true, message: "Drive file deleted" });
      }

    } else {
      return res.status(405).json({ error: "Method not allowed" });
    }

  } catch (err) {
    console.error("/api/sync error:", err);
    return res.status(500).json({ error: err.message });
  }
}
