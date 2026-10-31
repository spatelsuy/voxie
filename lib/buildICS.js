/**
 * buildICS.js
 *
 * Converts Kahija activity items into an ICS file (RFC 5545).
 * All items become VEVENT components — no distinction between
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

/** Format a Date as ICS floating local timestamp (no zone): 20250710T090000 */
function toICSLocalDateTime(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
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

/* ─── Recurrence ─────────────────────────────────────────────────────────── */

const DOW_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DOW_ICS   = ["SU","MO","TU","WE","TH","FR","SA"];

function ymdToLocalDate(ymd) {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** nth (1-4) or last (-1) given weekday of a month, as a local Date. */
function nthWeekdayOfMonth(year, month, weekday, n) {
  if (n === -1) {
    const last = new Date(year, month + 1, 0);
    return new Date(year, month, last.getDate() - ((last.getDay() - weekday + 7) % 7));
  }
  const first = new Date(year, month, 1);
  const day = 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7;
  const d = new Date(year, month, day);
  return d.getMonth() === month ? d : null;
}

function isAlternateDays(freq) {
  return freq === "alternate days" || freq === "every 2 days" || freq === "bi-daily";
}

/**
 * Build the RRULE value for a recurrence object, or null if the pattern isn't supported.
 * `anchor` is the first occurrence (local Date) — used where the rule has no explicit day.
 * `allDay` decides the UNTIL format (DATE for all-day, UTC date-time otherwise).
 */
function buildRRule(rec, anchor, allDay) {
  const freq = String(rec.frequency || "").toLowerCase();
  const dowIdx = rec.day_of_week ? DOW_NAMES.indexOf(rec.day_of_week) : -1;
  let parts;

  if (freq === "daily") {
    parts = ["FREQ=DAILY"];
  } else if (isAlternateDays(freq)) {
    parts = ["FREQ=DAILY", "INTERVAL=2"];
  } else if (freq === "weekly") {
    parts = ["FREQ=WEEKLY", `BYDAY=${DOW_ICS[dowIdx >= 0 ? dowIdx : anchor.getDay()]}`];
  } else if (freq === "monthly") {
    if (rec.week_of_month != null && dowIdx >= 0) {
      const n = rec.week_of_month === 5 ? -1 : rec.week_of_month;
      parts = ["FREQ=MONTHLY", `BYDAY=${n}${DOW_ICS[dowIdx]}`];
    } else {
      parts = ["FREQ=MONTHLY", `BYMONTHDAY=${rec.day_of_month != null ? rec.day_of_month : anchor.getDate()}`];
    }
  } else if (freq === "yearly") {
    parts = ["FREQ=YEARLY"];
  } else {
    return null;
  }

  if (rec.end_date) {
    const end = ymdToLocalDate(rec.end_date);
    if (!isNaN(end.getTime())) {
      // UNTIL must use the same form as DTSTART: DATE for all-day, floating local time otherwise
      parts.push(`UNTIL=${allDay ? toICSDate(end) : `${toICSDate(end)}T235959`}`);
    }
  }
  return parts.join(";");
}

/** First date on/after `from` that the recurrence rule produces (searches up to ~13 months). */
function firstOccurrence(rec, from) {
  const freq = String(rec.frequency || "").toLowerCase();
  const dowIdx = rec.day_of_week ? DOW_NAMES.indexOf(rec.day_of_week) : -1;
  const end = rec.end_date ? ymdToLocalDate(rec.end_date) : null;

  for (let i = 0; i < 400; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (end && d > end) return null;

    let ok = false;
    if (freq === "daily" || isAlternateDays(freq) || freq === "yearly") {
      ok = true; // first day of the series is the anchor itself
    } else if (freq === "weekly") {
      ok = dowIdx >= 0 ? d.getDay() === dowIdx : true;
    } else if (freq === "monthly") {
      if (rec.week_of_month != null && dowIdx >= 0) {
        const n = rec.week_of_month === 5 ? -1 : rec.week_of_month;
        const t = nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), dowIdx, n);
        ok = !!t && t.getTime() === d.getTime();
      } else if (rec.day_of_month != null) {
        ok = d.getDate() === rec.day_of_month;
      } else {
        ok = true;
      }
    } else {
      ok = true; // unsupported pattern: export a single event on the anchor date
    }
    if (ok) return d;
  }
  return null;
}

/** Time-of-day ("HH:MM") from an item's time string, or null. Ignores free text like "every Monday". */
function timeOfDay(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const m = timeStr.trim().replace(/^\d{4}-\d{2}-\d{2}[T ]?/, "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? { h, mi } : null;
}

/**
 * Resolve a recurring item to its first occurrence.
 * Returns { date, allDay } or null if the rule can't be placed.
 */
function resolveRecurring(item) {
  const rec = item.recurrence;
  const timeDate = /^\d{4}-\d{2}-\d{2}/.test(item.time || "") ? item.time.slice(0, 10) : null;
  const anchorYMD = rec.start_date || timeDate;
  const anchor = anchorYMD
    ? ymdToLocalDate(anchorYMD)
    : item.recordingDate ? new Date(item.recordingDate) : new Date();
  if (isNaN(anchor.getTime())) return null;

  const first = firstOccurrence(rec, anchor);
  if (!first) return null;

  const tod = timeOfDay(item.time);
  if (!tod) return { date: first, allDay: true };
  return { date: new Date(first.getFullYear(), first.getMonth(), first.getDate(), tod.h, tod.mi), allDay: false };
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
    // Recurring items: export the first occurrence plus an RRULE for the series
    if (item.recurrence?.is_recurring === true) {
      const r = resolveRecurring(item);
      if (r) included.push({ item, date: r.date, allDay: r.allDay });
      else needsFix.push({ item });
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

/** Default length of a timed activity on the calendar (activities have no end time). */
const DEFAULT_DURATION_MIN = 30;

/**
 * Build a complete ICS string from the classified `included` array.
 *
 * Each activity becomes a VEVENT component (RFC 5545 §3.6.1) so it appears on the
 * calendar in Outlook / Apple Calendar / Google Calendar. (VTODO was used before, but
 * Outlook files those under Tasks / To Do and does not show them on the calendar.)
 *   - Timed item   → DTSTART is a UTC datetime, DTEND = start + DEFAULT_DURATION_MIN
 *   - All-day item → DTSTART is a DATE, DTEND is the following day (exclusive)
 *
 * @param {Array<{item, date, allDay}>} includedItems
 * @param {string} calendarName
 * @returns {string} ICS file content
 */
export function buildICS(includedItems, calendarName = "Kahija Activities") {
  const now = toICSDateTime(new Date());

  const todos = includedItems.map(({ item, date, allDay }) => {
    const uid     = makeUID(item.id);
    const summary = escapeText(item.title || "Untitled");
    const ctx     = item.context ? escapeText(item.context) : "";
    // Recurring activities are flagged in the description (literal "\n" = ICS line break)
    const desc    = item.recurrence?.is_recurring === true
      ? `(recurring)${ctx ? "\\n" + ctx : ""}`
      : ctx;

    const isRecurring = item.recurrence?.is_recurring === true;

    let start, end;
    if (allDay) {
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      start = `DTSTART;VALUE=DATE:${toICSDate(date)}`;
      end   = `DTEND;VALUE=DATE:${toICSDate(next)}`;
    } else if (isRecurring) {
      // Floating local time: "9:00 every Monday" stays at 9:00 across daylight-saving changes
      const endDate = new Date(date.getTime() + DEFAULT_DURATION_MIN * 60000);
      start = `DTSTART:${toICSLocalDateTime(date)}`;
      end   = `DTEND:${toICSLocalDateTime(endDate)}`;
    } else {
      start = `DTSTART:${toICSDateTime(date)}`;
      end   = `DTEND:${toICSDateTime(new Date(date.getTime() + DEFAULT_DURATION_MIN * 60000))}`;
    }

    // PRIORITY: map Kahija priority to RFC 5545 numeric scale (1=high, 5=medium, 9=low)
    const priorityMap = { high: 1, medium: 5, low: 9 };
    const priority = priorityMap[item.priority] ?? 5;

    const lines = [
      "BEGIN:VEVENT",
      fold(`UID:${uid}`),
      `DTSTAMP:${now}`,
      fold(`SUMMARY:[Kahija] ${summary}`),
      start,
      end,
      "STATUS:CONFIRMED",
      // All-day items are reminders, not blocks of busy time
      `TRANSP:${allDay ? "TRANSPARENT" : "OPAQUE"}`,
      `PRIORITY:${priority}`,
      `CATEGORIES:Kahija`,
    ];

    if (desc) lines.push(fold(`DESCRIPTION:${desc}`));
    if (item.recurrence?.is_recurring) {
      const rrule = buildRRule(item.recurrence, date, allDay);
      if (rrule) lines.push(`RRULE:${rrule}`);
      else lines.push(fold(`COMMENT:Recurring — ${item.recurrence.frequency || ""}`));
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
    ...todos,
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
