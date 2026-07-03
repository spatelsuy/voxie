/**
 * /api/sync — Google Drive appdata sync for kahija-sync.json
 *
 * GET  /api/sync          → download latest snapshot from Drive (or 404 if none)
 * POST /api/sync          → upload/replace snapshot in Drive
 *
 * The user's accessToken is read server-side from the encrypted JWT session
 * and is never exposed to the browser.
 */

import { getServerSession } from "next-auth/next";
import { getToken }         from "next-auth/jwt";
import NextAuth             from "./auth/[...nextauth]";

const DRIVE_FILES_URL   = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL  = "https://www.googleapis.com/upload/drive/v3/files";
const FILE_NAME         = "kahija-sync.json";
const MIME_TYPE         = "application/json";

/** Retrieve the server-side access token from the encrypted JWT */
async function getAccessToken(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.accessToken || null;
}

/** Find the Drive appdata file id for FILE_NAME, or null if not found */
async function findFileId(accessToken) {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id,name)",
    q: `name='${FILE_NAME}'`,
  });
  const res = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const body = await res.json();
  return body.files?.[0]?.id || null;
}

/** Download and parse the JSON file from Drive */
async function downloadFile(accessToken, fileId) {
  const res = await fetch(
    `${DRIVE_FILES_URL}/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  return res.json();
}

/** Upload (create or update) the JSON file in Drive appdata */
async function uploadFile(accessToken, fileId, jsonBody) {
  const metadata = {
    name: FILE_NAME,
    ...(fileId ? {} : { parents: ["appDataFolder"] }),
  };

  const boundary = "---kahija_boundary_001";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: ${MIME_TYPE}\r\n\r\n` +
    JSON.stringify(jsonBody) +
    `\r\n--${boundary}--`;

  const url = fileId
    ? `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;

  const method = fileId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

export default async function handler(req, res) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    if (req.method === "GET") {
      /* ── Download ─────────────────────────────────── */
      const fileId = await findFileId(accessToken);
      if (!fileId) {
        return res.status(404).json({ error: "No sync file found" });
      }
      const data = await downloadFile(accessToken, fileId);
      return res.status(200).json(data);

    } else if (req.method === "POST") {
      /* ── Upload ───────────────────────────────────── */
      const snapshot = req.body;
      if (!snapshot || typeof snapshot !== "object") {
        return res.status(400).json({ error: "Invalid body" });
      }
      const fileId  = await findFileId(accessToken);
      const result  = await uploadFile(accessToken, fileId, snapshot);
      return res.status(200).json({ ok: true, fileId: result.id });

    } else {
      return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (err) {
    console.error("/api/sync error:", err);
    return res.status(500).json({ error: err.message });
  }
}
