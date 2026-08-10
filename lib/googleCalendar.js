import { getToken } from "next-auth/jwt";

const CAL_NAME = "From Kahija";

/** Pulls the Google access token out of the request's JWT — server-side only,
 *  never exposed to the browser (matches how your session callback already
 *  keeps accessToken out of the client-facing session object). */
export async function getAccessToken(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.accessToken) throw new Error("Not signed in");
  if (token.error === "RefreshAccessTokenError") throw new Error("Session expired — please sign in again");
  return token.accessToken;
}

async function gcal(accessToken, path, options = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Calendar API error: ${res.status} — ${text}`);
  }
  return res;
}

/** Finds the existing "From Kahija" calendar, or creates it if it doesn't exist yet.
 *  Returns the calendarId either way. */
export async function ensureKahijaCalendar(accessToken) {
  const listRes = await gcal(accessToken, "/users/me/calendarList?minAccessRole=owner");
  const list = await listRes.json();
  const existing = (list.items || []).find((c) => c.summary === CAL_NAME);
  if (existing) return existing.id;

  const createRes = await gcal(accessToken, "/calendars", {
    method: "POST",
    body: JSON.stringify({ summary: CAL_NAME, description: "Activities created by Kahija" }),
  });
  const created = await createRes.json();
  return created.id;
}

/** Pushes one extracted item as a Google Calendar event. */
export async function pushEventToCalendar(accessToken, item) {
  const calendarId = await ensureKahijaCalendar(accessToken);

  const start = item.time; // expects "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD"
  const isDateOnly = !start.includes("T");

  const event = {
    summary: item.title,
    description: item.context || undefined,
    ...(isDateOnly
      ? { start: { date: start }, end: { date: start } }
      : {
          start: { dateTime: start },
          end:   { dateTime: new Date(new Date(start).getTime() + 30 * 60000).toISOString() }, // default 30 min
        }),
  };

  const res = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
  return res.json();
}

/**
 * Upserts one item as a Google Calendar event using a stable event ID
 * derived from item.id — so pushing the same item twice updates it
 * instead of creating a duplicate.
 *
 * Accepts items with:
 *   - item.time  = "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (timed)
 *   - item.time  = null/empty  → falls back to item.allDayDate (a "YYYY-MM-DD" string)
 *
 * calendarId must be resolved by the caller (pass result of ensureKahijaCalendar)
 * so a list-or-create round-trip is not repeated for every item in a bulk push.
 */
export async function upsertEventToCalendar(accessToken, calendarId, item) {
  // Stable Google event ID: only lowercase letters, digits, spaces (we use hex-like chars)
  // Google requires event IDs to be 5–1024 chars, [a-v0-9] only (base32hex alphabet).
  // We derive one from the Kahija item id by stripping non-conforming chars.
  const stableId = item.id.replace(/[^a-v0-9]/g, "").slice(0, 64).toLowerCase() || null;

  // Resolve the date to use
  const timeStr   = item.time && item.time.trim() ? item.time.trim() : null;
  const allDayStr = item.allDayDate || null; // "YYYY-MM-DD" fallback set by the client

  let startBlock, endBlock;

  if (timeStr) {
    const isDateOnly = !timeStr.includes("T") && !timeStr.includes(" ");
    if (isDateOnly) {
      // All-day: end must be the *next* calendar day (exclusive) per RFC 5545 / Google API
      const [y, m, d] = timeStr.split("-").map(Number);
      const nextDay = new Date(y, m - 1, d + 1);
      const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}`;
      startBlock = { date: timeStr };
      endBlock   = { date: nextDayStr };
    } else {
      const dt = timeStr.replace(" ", "T"); // normalise space separator
      // Append timezone offset to keep start & end in the same local format.
      // Google requires both dateTime values to carry timezone info.
      const startDate = new Date(dt);
      const endDate   = new Date(startDate.getTime() + 60 * 60000); // +1 hour
      // Format as local ISO with offset e.g. "2026-08-10T09:00:00+05:30"
      function toLocalISO(d) {
        const off    = -d.getTimezoneOffset();
        const sign   = off >= 0 ? "+" : "-";
        const hh     = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
        const mm     = String(Math.abs(off) % 60).padStart(2, "0");
        const pad    = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
      }
      startBlock = { dateTime: toLocalISO(startDate) };
      endBlock   = { dateTime: toLocalISO(endDate) };
    }
  } else if (allDayStr) {
    // Same next-day rule for the recordingDate fallback
    const [y, m, d] = allDayStr.split("-").map(Number);
    const nextDay = new Date(y, m - 1, d + 1);
    const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,"0")}-${String(nextDay.getDate()).padStart(2,"0")}`;
    startBlock = { date: allDayStr };
    endBlock   = { date: nextDayStr };
  } else {
    throw new Error(`Item "${item.title}" has no usable date`);
  }

  const event = {
    summary:     item.title,
    description: item.context || undefined,
    start:       startBlock,
    end:         endBlock,
  };

  // Use PUT with stableId (upsert = insert-or-update); fall back to POST if id unusable
  if (stableId && stableId.length >= 5) {
    const putRes = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${stableId}`, {
      method: "PUT",
      body:   JSON.stringify({ ...event, id: stableId }),
    });
    if (putRes.status !== 404) return putRes.json();

    // 404 → event doesn't exist yet, create it with POST
    const postRes = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      body:   JSON.stringify({ ...event, id: stableId }),
    });
    return postRes.json();
  }

  // Fallback: plain POST (no dedup guarantee, but shouldn't happen with uuid-style ids)
  const res = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body:   JSON.stringify(event),
  });
  return res.json();
}

/** Deletes the entire "From Kahija" calendar, and everything in it, in one call. */
export async function deleteKahijaCalendar(accessToken) {
  const listRes = await gcal(accessToken, "/users/me/calendarList?minAccessRole=owner");
  const list = await listRes.json();
  const existing = (list.items || []).find((c) => c.summary === CAL_NAME);
  if (!existing) return { deleted: false, reason: "No Kahija calendar found" };

  await gcal(accessToken, `/calendars/${encodeURIComponent(existing.id)}`, { method: "DELETE" });
  return { deleted: true };
}