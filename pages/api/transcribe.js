const DEFAULT_API_URL = "https://decode-cri.vercel.app/a2t/transcribe";
const TRANSCRIBE_API_URL = process.env.TRANSCRIBE_API_URL || DEFAULT_API_URL;
const TRANSCRIBE_API_TOKEN = process.env.TRANSCRIBE_API_TOKEN;

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const headers = {};
    const contentType = req.headers["content-type"];
    const contentLength = req.headers["content-length"];

    if (contentType) headers["Content-Type"] = contentType;
    if (contentLength) headers["Content-Length"] = contentLength;
    if (TRANSCRIBE_API_TOKEN) {
      headers.Authorization = `Bearer ${TRANSCRIBE_API_TOKEN}`;
    }

    const response = await fetch(TRANSCRIBE_API_URL, {
      method: "POST",
      headers,
      body: req,
      duplex: "half",
    });

    const responseContentType = response.headers.get("content-type") || "application/json";
    const responseText = await response.text();

    res.status(response.status);
    res.setHeader("Content-Type", responseContentType);
    return res.send(responseText);
  } catch (error) {
    console.error("Transcription proxy failed:", error);
    return res.status(500).json({ error: "Transcription proxy failed" });
  }
}
