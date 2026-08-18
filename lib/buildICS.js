/**
 * buildICS.js
 *
 * Converts Kahija activity items into an ICS file (RFC 5545).
 * All items become VTODO components — no distinction between
 * tasks, events and reminders (they are all "activities").
 *
 * Classification rules (applied before this function is called):
 *   INCLUDED  — status !== "done", type !== "note", time is parseable OR null
 *   ALL-DAY   — time is null → DUE is set to recordingDate (all-day)
 *   OMITTED   — type === "note"  (not shown in preview, not exported)
 *   EXCLUDED  — status === "done"
 *   NEEDS FIX — type !== "note", status !== "done", time is a non-empty
 *               string that cannot be parsed to a real date — user should
 *               go to Inbox and correct it before exporting
 */

/* ─── Date parsing ───────────────────────────────────────────────────────── */

/**
 * Attempt to parse an item's `time` string into a JavaScript Date.
 * Returns null if the string is empty/null or cannot be resolved.
 *
 * Handles:
 *   "2025-07-10"            → date-only  (all-day flag = true)
 *   "2025-07-10T09:00"      → local datetime
 *   "2025-07-10 09:00"      → local datetime (space separator)
 *   "2025-07-10T09:00:00"   → local datetime with seconds
 *   "2025-07-10T09:00:00Z"  → UTC datetime
 */
export function parseItemTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const s = timeStr.trim();
  if (!s) return null;

  // ISO-like: YYYY-MM-DD or YYYY-MM-DDTHH:MM or YYYY-MM-DD HH:MM
  const isoRe = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(Z)?)?$/;
  const m = isoRe.exec(s);
  if (m) {
    const [, yr, mo, dy, hr, mn, sc, z] = m;
    if (hr === undefined) {
      // date-only → midnight local
      return { date: new Date(Number(yr), Number(mo) - 1, Number(dy)), allDay: true };
    }
    if (z === "Z") {
      return { date: new Date(Date.UTC(Number(yr), Number(mo)-1, Number(dy), Number(hr), Number(mn), Number(sc||0))), allDay: false };
    }
    return { date: new Date(Number(yr), Number(mo)-1, Number(dy), Number(hr), Number(mn), Number(sc||0)), allDay: false };
  }

  return null; // unparseable
}

/** Returns true if time string is non-empty but cannot be parsed. */
export function isUnparseable(timeStr) {
  if (!timeStr || typeof timeStr !== "string" || !timeStr.trim()) return false;
  return parseItemTime(timeStr) === null;
}

/* ─── ICS formatting helpers ─────────────────────────────────────────────── */

function pad(n) { return String(n).padStart(2, "0"); }

/** Format a Date as ICS UTC timestamp: 20250710T090000Z */
function toICSDateTime(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth()+1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Format a Date as ICS date-only value: 20250710 */
function toICSDate(date) {
  return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}`;
}

/** Fold long ICS lines at 75 octets as required by RFC 5545. */
function fold(line) {
  const max = 75;
  if (line.length <= max) return line;
  let out = "";
  let pos = 0;
  while (pos < line.length) {
    if (pos === 0) {
      out += line.slice(0, max);
      pos = max;
    } else {
      out += "\r\n " + line.slice(pos, pos + max - 1);
      pos += max - 1;
    }
  }
  return out;
}

/** Escape special ICS text characters. */
function escapeText(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g,  "\\;")
    .replace(/,/g,  "\\,")
    .replace(/\n/g, "\\n");
}

/** Generate a stable UID from an item id. */
function makeUID(itemId) {
  return `${itemId.replace(/[^a-zA-Z0-9-]/g, "-")}@kahija`;
}

/* ─── Classify items ─────────────────────────────────────────────────────── */

/**
 * Classify all items into four buckets:
 *   included   — will be exported (has date or falls back to all-day on recordingDate)
 *   noDate     — included but time is null → exports as all-day on recordingDate
 *   needsFix   — time string exists but cannot be parsed → user must fix in Inbox
 *   excluded   — done or note type
 */
export function classifyItems(items) {
  const included  = []; // { item, date, allDay }
  const needsFix  = []; // { item }
  const excluded  = []; // { item, reason: "done"|"note" }

  for (const item of items) {
    // Deleted items are never exported
    if (item.status === "deleted") continue;
    // Notes are never exported
    if (item.type === "note") {
      excluded.push({ item, reason: "note" });
      continue;
    }
    // Done items are excluded
    if (item.status === "done" || item.status === "completed") {
      excluded.push({ item, reason: "done" });
      continue;
    }
    // Try to parse time
    if (item.time && item.time.trim()) {
      const parsed = parseItemTime(item.time);
      if (parsed) {
        included.push({ item, date: parsed.date, allDay: parsed.allDay });
      } else {
        // Non-empty time string that cannot be parsed → needs fix
        needsFix.push({ item });
      }
    } else {
      // No time → all-day on recordingDate
      const fallback = item.recordingDate ? new Date(item.recordingDate) : new Date();
      included.push({ item, date: fallback, allDay: true });
    }
  }

  return { included, needsFix, excluded };
}

/* ─── Build ICS string ───────────────────────────────────────────────────── */

/**
 * Build a complete ICS string from the classified `included` array.
 * @param {Array<{item, date, allDay}>} includedItems
 * @param {string} calendarName
 * @returns {string} ICS file content
 */
export function buildICS(includedItems, calendarName = "Kahija Activities") {
  const now = toICSDateTime(new Date());

  const events = includedItems.map(({ item, date, allDay }) => {
    const uid     = makeUID(item.id);
    const summary = escapeText(item.title || "Untitled");
    const desc    = item.context ? escapeText(item.context) : "";

    let dtStart, dtEnd;
    if (allDay) {
      // All-day event: DATE value, DTEND = next calendar day (RFC 5545 §3.6.1)
      dtStart = `DTSTART;VALUE=DATE:${toICSDate(date)}`;
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      dtEnd = `DTEND;VALUE=DATE:${toICSDate(nextDay)}`;
    } else {
      // Timed event: UTC datetime, 1-hour duration
      dtStart = `DTSTART:${toICSDateTime(date)}`;
      const endDate = new Date(date.getTime() + 60 * 60 * 1000);
      dtEnd = `DTEND:${toICSDateTime(endDate)}`;
    }

    const lines = [
      "BEGIN:VEVENT",
      fold(`UID:${uid}`),
      `DTSTAMP:${now}`,
      fold(`SUMMARY:${summary}`),
      dtStart,
      dtEnd,
      `STATUS:CONFIRMED`,
    ];

    if (desc) lines.push(fold(`DESCRIPTION:${desc}`));
    if (item.recurrence?.is_recurring) {
      lines.push(fold(`COMMENT:Recurring — ${item.recurrence.frequency || ""}`));
    }

    lines.push("END:VEVENT");
    return lines.join("\r\n");
  });

  const cal = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Kahija//Kahija Activities//EN`,
    fold(`X-WR-CALNAME:${escapeText(calendarName)}`),
    "X-WR-TIMEZONE:UTC",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return cal;
}

/**
 * Trigger a browser download of the ICS file.
 * @param {string} icsContent
 * @param {string} filename
 */
export function downloadICS(icsContent, filename = "kahija-activities.ics") {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
