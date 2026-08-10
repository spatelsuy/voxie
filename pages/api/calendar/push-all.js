import { upsertEventToCalendar, ensureKahijaCalendar, getAccessToken } from "../../../lib/googleCalendar";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const accessToken = await getAccessToken(req);
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items array is required" });
    }

    // Resolve calendarId once — avoids one list-or-create call per item
    const calendarId = await ensureKahijaCalendar(accessToken);

    const results = await Promise.allSettled(
      items.map((item) => upsertEventToCalendar(accessToken, calendarId, item))
    );

    const pushed = results.filter((r) => r.status === "fulfilled").length;
    const errors = results
      .map((r, i) => r.status === "rejected" ? { title: items[i]?.title, error: r.reason?.message } : null)
      .filter(Boolean);

    res.status(200).json({ pushed, errors });
  } catch (err) {
    console.error("[push-all] handler error:", err);
    res.status(500).json({ error: err.message });
  }
}
