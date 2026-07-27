/**
 * /api/transcribe-only
 *
 * Proxy route: receives a multipart/form-data POST containing the audio
 * chunk and forwards it to the external Whisper backend.
 *
 * The request body is fully buffered before forwarding so there is no
 * dependency on Node.js stream piping through fetch's `duplex:"half"`
 * mode, which caused silent failures in the previous implementation.
 */

const DEFAULT_API_URL      = "https://decode-cri.vercel.app/a2t/transcribe_only";
const TRANSCRIBE_ONLY_URL  = process.env.TRANSCRIBE_ONLY_URL || DEFAULT_API_URL;
const TRANSCRIBE_API_TOKEN = process.env.TRANSCRIBE_API_TOKEN;

export const config = {
  api: { bodyParser: false },
};

function bufferRequest(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end",  ()  => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Read the entire body into memory first — avoids stream-pipe issues
    const bodyBuffer = await bufferRequest(req);

    const headers = {};
    const contentType = req.headers["content-type"];
    // Forward the multipart Content-Type header with its boundary intact
    if (contentType) headers["Content-Type"] = contentType;
    // Use the actual byte count we read, not the original header value
    headers["Content-Length"] = String(bodyBuffer.length);
    if (TRANSCRIBE_API_TOKEN) headers["Authorization"] = `Bearer ${TRANSCRIBE_API_TOKEN}`;

    const upstream = await fetch(TRANSCRIBE_ONLY_URL, {
      method: "POST",
      headers,
      body: bodyBuffer,
    });

    const upstreamContentType = upstream.headers.get("content-type") || "application/json";
    const upstreamText = await upstream.text();

    res.status(upstream.status);
    res.setHeader("Content-Type", upstreamContentType);
    return res.send(upstreamText);
  } catch (err) {
    console.error("[transcribe-only] proxy error:", err);
    return res.status(500).json({ error: "Proxy failed", detail: err.message });
  }
}
