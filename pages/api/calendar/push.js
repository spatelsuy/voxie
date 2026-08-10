import { pushEventToCalendar, getAccessToken } from "../../../lib/googleCalendar";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const accessToken = await getAccessToken(req);
    const { item } = req.body;
    if (!item?.title || !item?.time) {
      return res.status(400).json({ error: "item.title and item.time are required" });
    }
    const event = await pushEventToCalendar(accessToken, item);
    res.status(200).json({ event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}