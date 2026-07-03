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

  /* ── helpers ── */
  // Does timeStr look like a full date or datetime?  e.g. "2025-07-05" or "2025-07-05T14:00"
  const fullDateRe = /^\d{4}-\d{2}-\d{2}/;
  const hasFullDate = fullDateRe.test(timeStr);

  // Case 1: item.time contains a parseable date
  if (hasFullDate) {
    const ymd = timeStr.slice(0, 10); // "YYYY-MM-DD"
    return windowDays.includes(ymd) ? [ymd] : [];
  }

  // Case 2: time-only or null, check recurrence
  const isRecurring = rec?.is_recurring === true;

  if (!isRecurring) {
    // time-only + not recurring → Unscheduled
    return [];
  }

  // is_recurring = true — need start_date to proceed
  const startYMD = rec.start_date;
  if (!startYMD) return []; // can't place without anchor → Unscheduled

  const endYMD     = rec.end_date || null;
  const freq       = rec.frequency;
  const dowName    = rec.day_of_week; // e.g. "Monday"
  const startDate  = ymdToDate(startYMD);

  const matches = [];

  for (const ymd of windowDays) {
    const d = ymdToDate(ymd);
    // Must be on or after start_date
    if (d < startDate) continue;
    // Must be on or before end_date (if set)
    if (endYMD && d > ymdToDate(endYMD)) continue;

    if (freq === "daily") {
      matches.push(ymd);
    } else if (freq === "weekly") {
      if (dowName && WEEK_DAYS[d.getDay()] === dowName) matches.push(ymd);
    } else if (freq === "monthly") {
      if (d.getDate() === startDate.getDate()) matches.push(ymd);
    }
  }

  return matches;
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

    // Not in the window — check if it has a concrete past date
    const timeStr = item.time || "";
    if (fullDateRe.test(timeStr)) {
      const ymd = timeStr.slice(0, 10);
      if (ymd < today) {
        // Has a real date that's already passed → Past Due
        pastDue[item.type + "s"].push(item);
        return;
      }
    }

    // Recurring with a start_date that is entirely in the past and has ended
    const rec = item.recurrence;
    if (rec?.is_recurring && rec.start_date && rec.end_date && rec.end_date < today) {
      pastDue[item.type + "s"].push(item);
      return;
    }

    // Everything else → Unscheduled
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
function EditItemModal({ item, onSave, onClose }) {
  const [title,    setTitle]    = useState(item.title    || "");
  const [time,     setTime]     = useState(item.time     || "");
  const [priority, setPriority] = useState(item.priority || "low");
  const [context,  setContext]  = useState(item.context  || "");

  function handleSave() {
    onSave(item.id, {
      title:    title.trim()   || item.title,
      time:     time.trim()    || null,
      priority: item.type === "note" ? item.priority : priority,
      context:  context.trim() || null,
    });
    onClose();
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalTitle}>Edit {item.type}</div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {item.type !== "note" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              Time / Date
              {!item.time && <span className={styles.fieldHint}> — set a date to schedule this item</span>}
            </span>
            <input
              className={styles.input}
              value={time}
              placeholder="e.g. 2025-07-10T09:00 or 2025-07-10"
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
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
          <span className={styles.fieldLabel}>Context</span>
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

/* ─── Single item row ─────────────────────────────── */
function ItemRow({ item, onDelete, onStatusChange, onEdit, onViewSource, hasSource }) {
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

  /* Format a short recurrence label e.g. "↻ weekly · Mon" */
  function recLabel() {
    if (!isRecurring) return null;
    const freq = rec.frequency || "recurring";
    const dow  = rec.day_of_week ? ` · ${rec.day_of_week.slice(0,3)}` : "";
    return `↻ ${freq}${dow}`;
  }

  return (
    <div className={`${styles.row} ${rowTypeClass(item.type)} ${isCompleted ? styles.rowCompleted : ""} ${isExpanded ? styles.rowExpanded : ""}`}>
      <button
        className={`${styles.rowStatus} ${isCompleted ? styles.rowStatusDone : ""}`}
        onClick={handleStatusToggle}
        aria-label={isCompleted ? "Mark as in progress" : "Mark as completed"}
        title={isCompleted ? "Mark as in progress" : "Mark as completed"}
      />
      <button
        className={styles.rowMain}
        onClick={() => setIsExpanded((p) => !p)}
        aria-expanded={isExpanded}
        title={isExpanded ? "Collapse" : "Expand"}
      >
        <div className={styles.rowSummary}>
          <span className={styles.rowText}>{item.title}</span>
          <div className={styles.rowRightMeta}>
            {isRecurring && <span className={styles.recBadge}>{recLabel()}</span>}
            {item.time && !item.recurrence?.is_recurring && (
              <span className={styles.rowTime}>{item.time}</span>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className={styles.rowDetails}>
            {(hasPriority || item.isDeadline || hasSource || isRecurring) && (
              <div className={styles.rowMetaTags}>
                {isRecurring && rec.start_date && (
                  <span className={`${styles.rowMetaTag} ${styles.rowMetaRecurrence}`}>
                    ↻ {rec.frequency}
                    {rec.day_of_week ? ` · ${rec.day_of_week}` : ""}
                    {rec.start_date ? ` from ${rec.start_date}` : ""}
                    {rec.end_date   ? ` to ${rec.end_date}`     : ""}
                  </span>
                )}
                {hasPriority && (
                  <span className={`${styles.rowMetaTag} ${styles.rowMetaPriority}`}>
                    Priority: {item.priority}
                  </span>
                )}
                {item.isDeadline && (
                  <span className={`${styles.rowMetaTag} ${styles.rowMetaDeadline}`}>Deadline</span>
                )}
                {hasSource && (
                  <button className={`${styles.rowMetaTag} ${styles.rowSourceBtn}`} onClick={onViewSource}>
                    Open source
                  </button>
                )}
              </div>
            )}
            {item.context && (
              <div className={`${styles.rowMetaTag} ${styles.rowMetaContext}`}>{item.context}</div>
            )}
          </div>
        )}
      </button>
      <button className={styles.rowEdit}   onClick={() => onEdit(item)}      aria-label="Edit item" title="Edit">•••</button>
      <button className={styles.rowDelete} onClick={() => onDelete(item.id)} aria-label="Delete item" title="Delete">✕</button>
    </div>
  );
}

/* ─── Reusable section renderer ───────────────────── */
function TypeSections({ grp, a2tResults, onDeleteItem, onStatusChange, setEditingItem, setSourceText, unscheduled = false }) {
  const types = [
    { key: "events",    label: "Events"    },
    { key: "tasks",     label: "Tasks"     },
    { key: "reminders", label: "Reminders" },
    { key: "notes",     label: "Notes"     },
  ];
  return (
    <>
      {types.map(({ key, label }) =>
        grp[key].length > 0 ? (
          <div key={key}>
            <div className={`${styles.sec} ${unscheduled ? styles.secMuted : ""}`}>{label}</div>
            {grp[key].map((item) => (
              <ItemRow
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
        ) : null
      )}
    </>
  );
}

/* ─── Main component ──────────────────────────────── */
export default function Dashboard({
  items, a2tResults, onRecordPress, onDeleteItem, onStatusChange, onEditItem, showCompletedItems,
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [sourceText,  setSourceText]  = useState(null);
  const [viewMode,    setViewMode]    = useState("scheduled"); // "inbox" | "scheduled"

  const visibleItems = showCompletedItems
    ? items
    : items.filter((i) => i.status !== STATUS_COMPLETED);

  /* ── counts (always over all visible items) ── */
  const taskCnt  = visibleItems.filter((i) => i.type === "task").length;
  const eventCnt = visibleItems.filter((i) => i.type === "event").length;
  const remCnt   = visibleItems.filter((i) => i.type === "reminder").length;
  const hasSummaryCounts = taskCnt > 0 || eventCnt > 0 || remCnt > 0;
  const isEmpty  = visibleItems.length === 0;

  /* ── grouping ── */
  const inboxGroups    = viewMode === "inbox"     ? groupByRecording(visibleItems) : null;
  const inboxDates     = inboxGroups ? Object.keys(inboxGroups) : [];
  const scheduleResult = viewMode === "scheduled" ? groupBySchedule(visibleItems)  : null;

  /* ── shared row props factory ── */
  const rowProps = { a2tResults, onDeleteItem, onStatusChange, setEditingItem, setSourceText };

  return (
    <div className={styles.wrap}>
      {editingItem && (
        <EditItemModal item={editingItem} onSave={onEditItem} onClose={() => setEditingItem(null)} />
      )}
      {sourceText && <SourceModal sourceText={sourceText} onClose={() => setSourceText(null)} />}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>Kahija</div>
        <div className={styles.date}>{todayStr()}</div>
      </div>

      {/* Scroll area */}
      <div className={styles.scroll}>

        {/* Summary chips + toggle — only when there are items */}
        {hasSummaryCounts && (
          <>
            <div className={styles.chips}>
              <div className={`${styles.chip} ${styles.chipTask}`}>
                <div className={styles.chipNum}>{taskCnt}</div>
                <div className={styles.chipLbl}>Tasks</div>
              </div>
              <div className={`${styles.chip} ${styles.chipEvent}`}>
                <div className={styles.chipNum}>{eventCnt}</div>
                <div className={styles.chipLbl}>Events</div>
              </div>
              <div className={`${styles.chip} ${styles.chipReminder}`}>
                <div className={styles.chipNum}>{remCnt}</div>
                <div className={styles.chipLbl}>Reminders</div>
              </div>
            </div>

            {/* View toggle */}
            <div className={styles.toggle}>
              <button
                className={`${styles.toggleBtn} ${viewMode === "scheduled" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("scheduled")}
              >
                Due Date
              </button>
              <button
                className={`${styles.toggleBtn} ${viewMode === "inbox" ? styles.toggleBtnActive : ""}`}
                onClick={() => setViewMode("inbox")}
              >
                Logged Date
              </button>
            </div>
          </>
        )}

        {/* Empty state — OnboardingPanel fills entire scroll area */}
        {isEmpty ? (
          <div className={styles.onboardingFill}>
            <OnboardingPanel onAction={onRecordPress} />
          </div>

        ) : viewMode === "inbox" ? (
          /* ── Inbox view ── */
          inboxDates.map((dateKey) => {
            const grp = inboxGroups[dateKey];
            const total = grp.events.length + grp.tasks.length + grp.reminders.length + grp.notes.length;
            if (total === 0) return null;
            return (
              <div key={dateKey} className={styles.dateGroup}>
                <div className={styles.dateLabel}>
                  {dateKey === "unknown" ? "Inbox" : dayLabel(dateKey)}
                </div>
                <TypeSections grp={grp} {...rowProps} />
              </div>
            );
          })

        ) : (
          /* ── Scheduled view ── */
          <>
            {/* Past Due bucket — shown first */}
            {(() => {
              const p = scheduleResult.pastDue;
              const total = p.events.length + p.tasks.length + p.reminders.length + p.notes.length;
              if (total === 0) return null;
              return (
                <div className={styles.dateGroup}>
                  <div className={`${styles.dateLabel} ${styles.dateLabelPastDue}`}>
                    Past Due
                  </div>
                  <TypeSections grp={p} {...rowProps} />
                </div>
              );
            })()}

            {scheduleResult.windowDays.map((ymd) => {
              const grp   = scheduleResult.dateMap[ymd];
              const total = grp.events.length + grp.tasks.length + grp.reminders.length + grp.notes.length;
              if (total === 0) return null;
              return (
                <div key={ymd} className={styles.dateGroup}>
                  <div className={`${styles.dateLabel} ${ymd === toYMD(new Date()) ? styles.dateLabelToday : ""}`}>
                    {dayLabel(ymd)}
                  </div>
                  <TypeSections grp={grp} {...rowProps} />
                </div>
              );
            })}

            {/* Unscheduled bucket */}
            {(() => {
              const u = scheduleResult.unscheduled;
              const total = u.events.length + u.tasks.length + u.reminders.length + u.notes.length;
              if (total === 0) return null;
              return (
                <div className={styles.dateGroup}>
                  <div className={`${styles.dateLabel} ${styles.dateLabelUnscheduled}`}>
                    Unscheduled
                  </div>
                  <div className={styles.unscheduledHint}>
                    No date set — tap ••• on an item to add a date and schedule it.
                  </div>
                  <TypeSections grp={u} {...rowProps} unscheduled />
                </div>
              );
            })()}
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
