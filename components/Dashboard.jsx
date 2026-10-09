import { useEffect, useState } from "react";
import OnboardingPanel from "./OnboardingPanel";
import styles from "../styles/dashboard.module.css";

const STATUS_COMPLETED  = "completed";
const STATUS_INPROGRESS = "inprogress";
const PRIORITY_OPTIONS  = ["high", "medium", "low"];
const WEEK_DAYS         = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/* ─── Helpers ─────────────────────────────────────── */
function todayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function rowTypeClass(type) {
  if (type === "task")     return styles.rowTask;
  if (type === "event")    return styles.rowEvent;
  if (type === "reminder") return styles.rowReminder;
  return styles.rowNote;
}

/* ─── Date utilities ──────────────────────────────── */

/** Return "YYYY-MM-DD" for a Date object (local time). */
function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/** Return Date at midnight local for a "YYYY-MM-DD" string. */
function ymdToDate(str) {
  const [y,m,d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function nthWeekdayOfMonth(year, monthIndex, weekdayIndex, n) {
  if (n === -1) {
    // "Last <weekday>" — walk backward from month-end to the last match
    const lastDay = new Date(year, monthIndex + 1, 0);
    const offset = (lastDay.getDay() - weekdayIndex + 7) % 7;
    lastDay.setDate(lastDay.getDate() - offset);
    return lastDay;
  }
  const firstDay = new Date(year, monthIndex, 1);
  const offset = (weekdayIndex - firstDay.getDay() + 7) % 7;
  const date = 1 + offset + (n - 1) * 7;
  const result = new Date(year, monthIndex, date);
  return result.getMonth() === monthIndex ? result : null; // guards "5th" not existing that month
}


/** Human-readable day label for a date key.
 *  Accepts both "YYYY-MM-DD" (scheduled view) and any Date-parseable string
 *  such as "Tue Jul 01 2025" (inbox view / recordingDate). */
function dayLabel(dateKey) {
  // Normalise to YYYY-MM-DD for today/tomorrow comparison
  const today    = toYMD(new Date());
  const tomorrow = toYMD(new Date(Date.now() + 86400000));

  // If it already looks like YYYY-MM-DD use it directly, otherwise parse
  const fullDateRe = /^\d{4}-\d{2}-\d{2}/;
  const ymd = fullDateRe.test(dateKey) ? dateKey.slice(0, 10) : toYMD(new Date(dateKey));

  if (ymd === today)    return "Today";
  if (ymd === tomorrow) return "Tomorrow";

  const d = ymdToDate(ymd);
  if (isNaN(d.getTime())) return dateKey; // fallback: show raw string rather than "Invalid Date"
  return d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
}

/**
 * Resolve the scheduled date(s) for an item within a window of YMD strings.
 * Returns an array of "YYYY-MM-DD" strings (may be empty → Unscheduled).
 */
function resolveScheduledDates(item, windowDays) {
  const rec = item.recurrence;
  const timeStr = item.time || "";

  const fullDateRe  = /^\d{4}-\d{2}-\d{2}/;
  const hasFullDate = fullDateRe.test(timeStr);
  const isRecurring = rec?.is_recurring === true;

  // Case 1: non-recurring item with a concrete date — place on that date only
  if (hasFullDate && !isRecurring) {
    const ymd = timeStr.slice(0, 10);
    return windowDays.includes(ymd) ? [ymd] : [];
  }

  // Case 2: recurring
  if (isRecurring) {
    const freq = rec.frequency;
    const startYMD  = rec.start_date || (hasFullDate ? timeStr.slice(0, 10) : null);
    const startDate = startYMD ? ymdToDate(startYMD) : null;

    // These patterns are fully defined by the recurrence rule itself and don't
    // need a start_date/time anchor to know which future dates match. Only
    // "alternate days" genuinely needs an anchor, to compute odd/even parity.
    const selfSufficient =
      freq === "daily" ||
      (freq === "weekly" && !!rec.day_of_week) ||
      (freq === "monthly" && (rec.day_of_month != null || (rec.week_of_month != null && rec.day_of_week)));

    if (!startDate && !selfSufficient) return []; // no anchor and no self-sufficient rule → Unscheduled

    const endYMD  = rec.end_date || null;
    const dowName = rec.day_of_week;

    const matches = [];
    for (const ymd of windowDays) {
      const d = ymdToDate(ymd);
      if (startDate && d < startDate) continue;
      if (endYMD && d > ymdToDate(endYMD)) continue;

      if (freq === "daily") {
        matches.push(ymd);
      } else if (freq === "alternate days" || freq === "every 2 days" || freq === "bi-daily") {
        if (!startDate) continue; // this one still genuinely needs an anchor
        const diffDays = Math.round((d - startDate) / 86400000);
        if (diffDays % 2 === 0) matches.push(ymd);
      } else if (freq === "weekly") {
        if (dowName && WEEK_DAYS[d.getDay()] === dowName) matches.push(ymd);
      } else if (freq === "monthly") {
        if (rec.week_of_month != null && dowName) {
          const weekdayIndex = WEEK_DAYS.indexOf(dowName);
          const n = rec.week_of_month === 5 ? -1 : rec.week_of_month;
          const target = nthWeekdayOfMonth(d.getFullYear(), d.getMonth(), weekdayIndex, n);
          if (target && toYMD(target) === ymd) matches.push(ymd);
        } else if (rec.day_of_month != null) {
          if (d.getDate() === rec.day_of_month) matches.push(ymd);
        } else if (startDate && d.getDate() === startDate.getDate()) {
          matches.push(ymd); // legacy fallback for old records with no day_of_month field
        }
      }
    }
    return matches;
  }

  // Case 3: time-only string, not recurring → Unscheduled
  return [];
}


/* ─── Group items by recordingDate (Inbox view) ───── */
function groupByRecording(items) {
  const sorted = [...items].sort(
    (a, b) => new Date(b.recordingDate) - new Date(a.recordingDate)
  );

  const dateMap = {};
  sorted.forEach((item) => {
    const key = item.recordingDate || "unknown";
    if (!dateMap[key]) dateMap[key] = { tasks: [], events: [], reminders: [], notes: [] };
    dateMap[key][item.type + "s"].push(item);
  });

  const PRIO = { high: 0, medium: 1, low: 2 };
  Object.values(dateMap).forEach((grp) => {
    grp.events.sort((a,b)    => (a.time||"").localeCompare(b.time||""));
    grp.reminders.sort((a,b) => (a.time||"").localeCompare(b.time||""));
    grp.tasks.sort((a,b)     => (PRIO[a.priority]??2) - (PRIO[b.priority]??2));
  });

  return dateMap; // keys are recordingDate strings
}

/* ─── Group items by scheduled date (Scheduled view) ─ */
function groupBySchedule(items, windowSize = 7) {
  const today = toYMD(new Date());

  // Build the 7-day window as "YYYY-MM-DD" strings (today … today+6)
  const windowDays = [];
  for (let i = 0; i < windowSize; i++) {
    windowDays.push(toYMD(new Date(Date.now() + i * 86400000)));
  }

  const dateMap     = {}; // { "YYYY-MM-DD": { tasks,events,reminders,notes } }
  const pastDue     = { tasks: [], events: [], reminders: [], notes: [] };
  const unscheduled = { tasks: [], events: [], reminders: [], notes: [] };

  windowDays.forEach((ymd) => {
    dateMap[ymd] = { tasks: [], events: [], reminders: [], notes: [] };
  });

  const fullDateRe = /^\d{4}-\d{2}-\d{2}/;

  items.forEach((item) => {
    const dates = resolveScheduledDates(item, windowDays);

    if (dates.length > 0) {
      // Falls within the 7-day window
      dates.forEach((ymd) => {
        const occ = { ...item, _occurrenceDate: ymd };
        dateMap[ymd][item.type + "s"].push(occ);
      });
      return;
    }

    // Not in the window — decide where it belongs
    const timeStr = item.time || "";
    const rec     = item.recurrence;

    if (fullDateRe.test(timeStr)) {
      const ymd = timeStr.slice(0, 10);
      if (ymd < today) {
        // Concrete date already passed → Past Due
        pastDue[item.type + "s"].push(item);
      }
      // Concrete date in the future but beyond window → skip (will appear when window reaches it)
      return;
    }

    if (rec?.is_recurring) {
      if (rec.start_date && rec.end_date && rec.end_date < today) {
        // Recurring range entirely in the past → Past Due
        pastDue[item.type + "s"].push(item);
        return;
      }
      if (rec.start_date) {
        // Has a start_date (future or active) but no matches in window → skip
        return;
      }
      // is_recurring but no start_date — can't place it → Unscheduled
    }

    // Truly dateless, non-recurring → Unscheduled
    unscheduled[item.type + "s"].push(item);
  });

  const PRIO = { high: 0, medium: 1, low: 2 };
  const sortGrp = (grp) => {
    grp.events.sort((a,b)    => (a.time||"").localeCompare(b.time||""));
    grp.reminders.sort((a,b) => (a.time||"").localeCompare(b.time||""));
    grp.tasks.sort((a,b)     => (PRIO[a.priority]??2) - (PRIO[b.priority]??2));
  };
  windowDays.forEach((ymd) => sortGrp(dateMap[ymd]));
  sortGrp(pastDue);
  sortGrp(unscheduled);

  return { dateMap, windowDays, pastDue, unscheduled };
}

/* ─── Edit item modal ─────────────────────────────── */
/* Parse an item.time string into { datePart: "YYYY-MM-DD", timePart: "HH:MM" }.
   Returns empty strings for parts that can't be extracted. */
function parseTimeString(str) {
  if (!str || !str.trim()) return { datePart: "", timePart: "", unparseable: "" };
  const s = str.trim();
  // Matches: "YYYY-MM-DD", "YYYY-MM-DDTHH:MM", "YYYY-MM-DD HH:MM", "YYYY-MM-DDTHH:MM:SS"
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (m) return { datePart: m[1], timePart: m[2] ? m[2].slice(0, 5) : "", unparseable: "" };
  // Can't parse (e.g. "next Friday", "tomorrow 9am") — surface as hint
  return { datePart: "", timePart: "", unparseable: s };
}

function EditItemModal({ item, onSave, onClose }) {
  const [title,    setTitle]    = useState(item.title    || "");
  const [priority, setPriority] = useState(item.priority || "low");
  const [context,  setContext]  = useState(item.context  || "");

  const parsed = parseTimeString(item.time);
  const [datePart, setDatePart] = useState(parsed.datePart);
  const [timePart, setTimePart] = useState(parsed.timePart);
  const unparseable = parsed.unparseable; // original AI string shown as hint, not editable

  function handleSave() {
    // Recombine into ISO-like format: "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD"
    let combinedTime = null;
    if (datePart) {
      combinedTime = timePart ? `${datePart}T${timePart}:00` : datePart;
    }
    onSave(item.id, {
      title:    title.trim()   || item.title,
      time:     combinedTime,
      priority: item.type === "note" ? item.priority : priority,
      context:  context.trim() || null,
    });
    onClose();
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Edit activity</div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {item.type !== "note" && (
          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              Date &amp; Time
              {!datePart && !unparseable && <span className={styles.fieldHint}> — set a date to schedule this item</span>}
            </span>
            {unparseable && (
              <div className={styles.fieldUnparseable}>
                AI suggested: &ldquo;{unparseable}&rdquo; — please pick a date below
              </div>
            )}
            <div className={styles.dateTimeRow}>
              <input
                type="date"
                className={styles.inputDate}
                value={datePart}
                onChange={(e) => setDatePart(e.target.value)}
              />
              <input
                type="time"
                className={styles.inputTime}
                value={timePart}
                onChange={(e) => setTimePart(e.target.value)}
              />
            </div>
            {datePart && (
              <button
                type="button"
                className={styles.clearDateBtn}
                onClick={() => { setDatePart(""); setTimePart(""); }}
              >
                Clear date &amp; time
              </button>
            )}
          </div>
        )}
        {item.type !== "note" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Priority</span>
            <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Context / Notes</span>
          <input className={styles.input} value={context} onChange={(e) => setContext(e.target.value)} />
        </label>
        <div className={styles.modalActions}>
          <button className={styles.modalBtnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.modalBtnPrimary}   onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Source modal ────────────────────────────────── */
function SourceModal({ sourceText, onClose }) {
  if (!sourceText) return null;
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.sourceModal}`}>
        <div className={styles.sourceModalHeader}>
          <div>
            <div className={styles.sourceModalTitle}>Original transcription</div>
            <div className={styles.sourceModalSub}>Source text for this extracted item</div>
          </div>
          <button className={styles.sourceModalClose} onClick={onClose} aria-label="Close source modal">✕</button>
        </div>
        <div className={styles.sourceBody}>{sourceText}</div>
      </div>
    </div>
  );
}

/* ─── Single Unified Item Card ────────────────────── */
function ItemCard({ item, onDelete, onStatusChange, onEdit, onViewSource, hasSource, isPastDue }) {
  const [status,     setStatus]     = useState(item.status || STATUS_INPROGRESS);
  const [isExpanded, setIsExpanded] = useState(false);
  const isCompleted = status === STATUS_COMPLETED;
  const hasPriority = !!item.priority;
  const rec         = item.recurrence;
  const isRecurring = rec?.is_recurring === true;

  useEffect(() => {
    setStatus(item.status || STATUS_INPROGRESS);
  }, [item.status]);

  async function handleStatusToggle() {
    const next = isCompleted ? STATUS_INPROGRESS : STATUS_COMPLETED;
    setStatus(next);
    await onStatusChange(item.id, next);
  }

  function recLabel() {
    if (!isRecurring) return null;
    const freq = rec.frequency || "recurring";
    const dow  = rec.day_of_week ? ` · ${rec.day_of_week.slice(0,3)}` : "";
    return `↻ ${freq}${dow}`;
  }

  let displayTime = "";
  if (item.time) {
    const parsed = parseTimeString(item.time);
    displayTime = parsed.timePart || item.time.replace(/^\d{4}-\d{2}-\d{2}[T ]?/, "").trim();
  }

  return (
    <div className={`${styles.card} ${isCompleted ? styles.cardCompleted : ""} ${isPastDue ? styles.cardPastDue : ""} ${isExpanded ? styles.cardExpanded : ""}`}>
      <div className={styles.cardHeader}>
        <button
          className={`${styles.checkbox} ${isCompleted ? styles.checkboxChecked : ""}`}
          onClick={handleStatusToggle}
          aria-label={isCompleted ? "Mark as in progress" : "Mark as completed"}
          title={isCompleted ? "Mark as in progress" : "Mark as completed"}
        >
          {isCompleted && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path d="M1 4.5L4 7.5L10 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <div
          className={styles.cardMain}
          onClick={() => setIsExpanded((p) => !p)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setIsExpanded((p) => !p)}
          aria-expanded={isExpanded}
        >
          <div className={styles.cardTitleRow}>
            <span className={`${styles.cardTitle} ${isCompleted ? styles.cardTitleDone : ""}`}>
              {item.title}
            </span>
            {displayTime && !isRecurring && (
              <span className={styles.cardTime}>
                <span className={styles.timeIcon}>🕒</span>
                {displayTime}
              </span>
            )}
          </div>

          <div className={styles.cardBadgeRow}>
            {hasPriority && (
              <span className={`${styles.badge} ${styles[`priority_${item.priority}`] || styles.badgeDefault}`}>
                ⚡ {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
              </span>
            )}
            {isRecurring && (
              <span className={`${styles.badge} ${styles.badgeRec}`}>
                {recLabel()}
              </span>
            )}
            {item.isDeadline && (
              <span className={`${styles.badge} ${styles.badgeDeadline}`}>
                Deadline
              </span>
            )}
            {hasSource && (
              <button
                type="button"
                className={`${styles.badge} ${styles.badgeSource}`}
                onClick={(e) => { e.stopPropagation(); onViewSource(); }}
                title="View original voice transcription"
                aria-label="View original voice transcription"
              >
                🎙 VT
              </button>
            )}
          </div>

          {isExpanded && (
            <div className={styles.cardDetails}>
              {isRecurring && rec.start_date && (
                <div className={styles.detailRow}>
                  <strong>Schedule:</strong> {rec.frequency} {rec.day_of_week ? `(${rec.day_of_week})` : ""} from {rec.start_date} {rec.end_date ? `to ${rec.end_date}` : ""}
                </div>
              )}
              {item.context && (
                <div className={styles.detailRow}>
                  <strong>Context:</strong> {item.context}
                </div>
              )}
              {item.sourceSegment && (
                <div className={styles.detailQuote}>
                  <div className={styles.quoteLabel}>From audio recording:</div>
                  "{item.sourceSegment}"
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.cardActions}>
          <button className={styles.actionBtn} onClick={() => onEdit(item)} aria-label="Edit item" title="Edit">
            •••
          </button>
          <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => onDelete(item.id)} aria-label="Delete item" title="Delete">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper: Get Monday of a given date's week ──── */
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7; // Monday = 0, Sunday = 6
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ─── Calendar Navigation Strip (7-day Monday to Sunday Week) ──── */
const SHORT_DAYS = ["M", "Tu", "W", "Th", "F", "S", "Su"];

function CalendarStrip({ currentWeekMonday, onWeekChange, selectedDate, onSelectDate, activityDatesMap, onJumpToday }) {
  const now = new Date();
  const todayYMD = toYMD(now);
  // Short format without year (year is already in the centered month title) to avoid mobile overlap
  const todayShortStr = `Today, ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Generate 7 days starting from Monday through Sunday
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dObj = new Date(currentWeekMonday.getTime() + i * 86400000);
    const ymd = toYMD(dObj);
    days.push({
      dayNum: dObj.getDate(),
      ymd,
      dayName: SHORT_DAYS[i],
      hasActivity: !!activityDatesMap[ymd],
      isToday: ymd === todayYMD,
      isSelected: ymd === selectedDate,
    });
  }

  // Header display: e.g. "October 2024" or "Oct – Nov 2024" if spanning two months
  const firstDay = new Date(currentWeekMonday);
  const lastDay = new Date(currentWeekMonday.getTime() + 6 * 86400000);
  const headerText = firstDay.getMonth() === lastDay.getMonth()
    ? firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : `${firstDay.toLocaleDateString("en-US", { month: "short" })} – ${lastDay.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;

  function handlePrevWeek() {
    onWeekChange(new Date(currentWeekMonday.getTime() - 7 * 86400000));
  }

  function handleNextWeek() {
    onWeekChange(new Date(currentWeekMonday.getTime() + 7 * 86400000));
  }

  return (
    <div className={styles.calWrapper}>
      {/* Centered Month/Year Title + Today Button (without duplicate year) */}
      <div className={styles.calHeader}>
        <div className={styles.calHeaderLeftPlaceholder} />
        <span className={styles.calMonthTitle}>{headerText}</span>
        <button className={styles.todayBtn} onClick={onJumpToday} title="Jump to today">
          {todayShortStr}
        </button>
      </div>

      {/* Week row with < on left and > on right */}
      <div className={styles.weekContainer}>
        <button
          type="button"
          className={`${styles.weekNavBtn} ${styles.weekNavLeft}`}
          onClick={handlePrevWeek}
          aria-label="Previous week"
          title="Previous week"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* 7 Days Monday till Sunday row */}
        <div className={styles.daysRow}>
          {days.map((item) => (
            <button
              key={item.ymd}
              type="button"
              className={`${styles.dayPill} ${item.isSelected ? styles.dayPillSelected : ""} ${item.isToday ? styles.dayPillToday : ""}`}
              onClick={() => onSelectDate(item.ymd)}
            >
              <span className={styles.dayName}>{item.dayName}</span>
              <span className={styles.dayNum}>{item.dayNum}</span>
              {item.hasActivity && <span className={styles.activityDot} />}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`${styles.weekNavBtn} ${styles.weekNavRight}`}
          onClick={handleNextWeek}
          aria-label="Next week"
          title="Next week"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ──────────────────────────────── */
export default function Dashboard({
  items, a2tResults, onRecordPress, onDeleteItem, onStatusChange, onEditItem, showCompletedItems, scheduleWindow = 7,
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [sourceText,  setSourceText]  = useState(null);

  const todayYMD = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(todayYMD);
  const [currentWeekMonday, setCurrentWeekMonday] = useState(() => getMonday(new Date()));
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  const visibleItems = items
    .filter((i) => i.status !== "deleted")
    .filter((i) => showCompletedItems ? true : i.status !== STATUS_COMPLETED);

  const isEmpty = visibleItems.length === 0;

  // Build a query window covering the current week plus surrounding days (scheduleWindow)
  const windowDays = [];
  for (let i = -7; i < Math.max(14, scheduleWindow + 7); i++) {
    windowDays.push(toYMD(new Date(currentWeekMonday.getTime() + i * 86400000)));
  }

  // Map activities to dates
  const activityDatesMap = {};
  const dayItemsMap = {};
  const unscheduledItems = [];
  const pastDueItems = [];

  const fullDateRe = /^\d{4}-\d{2}-\d{2}/;

  visibleItems.forEach((item) => {
    const dates = resolveScheduledDates(item, windowDays);
    if (dates.length > 0) {
      dates.forEach((ymd) => {
        activityDatesMap[ymd] = true;
        if (!dayItemsMap[ymd]) dayItemsMap[ymd] = [];
        dayItemsMap[ymd].push({ ...item, _occurrenceDate: ymd });
      });
      return;
    }

    const timeStr = item.time || "";
    const rec     = item.recurrence;
    const isRecurring = rec?.is_recurring === true;

    // Recurring items are ongoing schedules and should never be marked as past-due
    if (isRecurring) {
      return;
    }

    if (fullDateRe.test(timeStr)) {
      const ymd = timeStr.slice(0, 10);
      if (ymd < todayYMD) {
        pastDueItems.push(item);
      } else {
        activityDatesMap[ymd] = true;
        if (!dayItemsMap[ymd]) dayItemsMap[ymd] = [];
        dayItemsMap[ymd].push(item);
      }
      return;
    }

    unscheduledItems.push(item);
  });

  // Sort activities for selected date chronologically
  const activeActivities = (dayItemsMap[selectedDate] || []).sort((a, b) => {
    const PRIO = { high: 0, medium: 1, low: 2 };
    const timeA = a.time || "";
    const timeB = b.time || "";
    if (timeA && timeB) return timeA.localeCompare(timeB);
    return (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2);
  });

  function handleJumpToday() {
    const now = new Date();
    setCurrentWeekMonday(getMonday(now));
    setSelectedDate(toYMD(now));
  }

  function handleDateSelect(ymd) {
    setSelectedDate(ymd);
    const d = ymdToDate(ymd);
    const mondayOfSelected = getMonday(d);
    if (toYMD(mondayOfSelected) !== toYMD(currentWeekMonday)) {
      setCurrentWeekMonday(mondayOfSelected);
    }
  }

  function handleWeekChange(newMonday) {
    setCurrentWeekMonday(newMonday);
    // Keep selected date within the newly viewed week
    const selD = ymdToDate(selectedDate);
    const diff = (selD.getDay() + 6) % 7;
    const correspondingDay = new Date(newMonday.getTime() + diff * 86400000);
    setSelectedDate(toYMD(correspondingDay));
  }

  const formattedSelectedDate = (() => {
    const d = ymdToDate(selectedDate);
    if (isNaN(d.getTime())) return selectedDate;
    const full = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    if (selectedDate === todayYMD) return `Today · ${full}`;
    return full;
  })();

  return (
    <div className={styles.wrap}>
      {editingItem && (
        <EditItemModal item={editingItem} onSave={onEditItem} onClose={() => setEditingItem(null)} />
      )}
      {sourceText && <SourceModal sourceText={sourceText} onClose={() => setSourceText(null)} />}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>Kahija</div>
          <div className={styles.date}>{todayStr()}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/K_Logo.png" alt="Kahija" className={styles.headerLogo} />
      </div>

      {/* Scroll area */}
      <div className={styles.scroll}>
        {isEmpty ? (
          <div className={styles.onboardingFill}>
            <OnboardingPanel onAction={onRecordPress} />
          </div>
        ) : (
          <>
            {/* Calendar Week & Day Strip */}
            <CalendarStrip
              currentWeekMonday={currentWeekMonday}
              onWeekChange={handleWeekChange}
              selectedDate={selectedDate}
              onSelectDate={handleDateSelect}
              activityDatesMap={activityDatesMap}
              onJumpToday={handleJumpToday}
            />

            {/* Past Due Alert Banner (if any) */}
            {pastDueItems.length > 0 && (
              <div className={styles.pastDueBanner}>
                <div className={styles.pastDueHeader}>
                  <span className={styles.pastDueTitle}>⚠️ Overdue Activities ({pastDueItems.length})</span>
                </div>
                <div className={styles.pastDueList}>
                  {pastDueItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onDelete={onDeleteItem}
                      onStatusChange={onStatusChange}
                      onEdit={setEditingItem}
                      hasSource={!!a2tResults[item.sourceRecordingId]?.transcription}
                      onViewSource={() => setSourceText(a2tResults[item.sourceRecordingId]?.transcription || null)}
                      isPastDue
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Selected Day Activities Header */}
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <span className={styles.sectionLabel}>ACTIVITIES</span>
                <span className={styles.sectionDate}>{formattedSelectedDate}</span>
              </div>
              <span className={styles.itemCountBadge}>
                {activeActivities.length} {activeActivities.length === 1 ? "activity" : "activities"}
              </span>
            </div>

            {/* Unified Activities List */}
            {activeActivities.length > 0 ? (
              <div className={styles.activityList}>
                {activeActivities.map((item) => (
                  <ItemCard
                    key={item._occurrenceDate ? `${item.id}_${item._occurrenceDate}` : item.id}
                    item={item}
                    onDelete={onDeleteItem}
                    onStatusChange={onStatusChange}
                    onEdit={setEditingItem}
                    hasSource={!!a2tResults[item.sourceRecordingId]?.transcription}
                    onViewSource={() => setSourceText(a2tResults[item.sourceRecordingId]?.transcription || null)}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyDay}>
                <div className={styles.emptyDayIcon}>☕</div>
                <div className={styles.emptyDayTitle}>No activities scheduled for this day</div>
                <div className={styles.emptyDaySub}>Enjoy your day or record a new voice note below.</div>
              </div>
            )}

            {/* Unscheduled Items Collapsible Drawer */}
            {unscheduledItems.length > 0 && (
              <div className={styles.unscheduledSection}>
                <button
                  type="button"
                  className={styles.unscheduledToggle}
                  onClick={() => setShowUnscheduled((prev) => !prev)}
                >
                  <span>📋 Unscheduled Notes & Tasks ({unscheduledItems.length})</span>
                  <span className={styles.toggleArrow}>{showUnscheduled ? "▲" : "▼"}</span>
                </button>
                {showUnscheduled && (
                  <div className={styles.unscheduledList}>
                    {unscheduledItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onDelete={onDeleteItem}
                        onStatusChange={onStatusChange}
                        onEdit={setEditingItem}
                        hasSource={!!a2tResults[item.sourceRecordingId]?.transcription}
                        onViewSource={() => setSourceText(a2tResults[item.sourceRecordingId]?.transcription || null)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating mic */}
      {!isEmpty && (
        <button className={styles.fab} onClick={onRecordPress} aria-label="New recording">🎙</button>
      )}
    </div>
  );
}
