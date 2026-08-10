import { deleteKahijaCalendar, getAccessToken } from "../../../lib/googleCalendar";

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).end();
  try {
    const accessToken = await getAccessToken(req);
    const result = await deleteKahijaCalendar(accessToken);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}