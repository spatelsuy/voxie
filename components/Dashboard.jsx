import styles from "../styles/dashboard.module.css";

/* ─── Helpers ─────────────────────────────────────── */
function todayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function dateLabel(dateStr) {
  if (!dateStr) return "";
  const d   = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate();
  if (isToday) return "Today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function priorityDotClass(p) {
  if (p === "high")   return styles.dotHigh;
  if (p === "medium") return styles.dotMed;
  return styles.dotLow;
}

const TYPE_ICON = { task: null, event: "📅", reminder: "🔔", note: "📝" };

/* ─── Group items by date, then by type ───────────── */
function groupItems(items) {
  // Sort newest date first
  const sorted = [...items].sort(
    (a, b) => new Date(b.recordingDate) - new Date(a.recordingDate)
  );

  const dateMap = {}; // { dateStr: { tasks, events, reminders, notes } }
  sorted.forEach((item) => {
    const key = item.recordingDate || "unknown";
    if (!dateMap[key]) dateMap[key] = { tasks: [], events: [], reminders: [], notes: [] };
    dateMap[key][item.type + "s"].push(item);
  });

  // Sort within each date: events/reminders by time, tasks by priority
  const PRIO = { high: 0, medium: 1, low: 2 };
  Object.values(dateMap).forEach((grp) => {
    grp.events.sort((a, b)    => (a.time || "").localeCompare(b.time || ""));
    grp.reminders.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    grp.tasks.sort((a, b)     => (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2));
  });

  return dateMap;
}

/* ─── Single item row ─────────────────────────────── */
function ItemRow({ item, onDelete }) {
  const icon = TYPE_ICON[item.type];
  return (
    <div className={styles.row}>
      {icon
        ? <span className={styles.rowIcon}>{icon}</span>
        : <div className={`${styles.dot} ${priorityDotClass(item.priority)}`} />
      }
      <span className={styles.rowText}>{item.title}</span>
      {item.time && <span className={styles.rowTime}>{item.time}</span>}
      <button
        className={styles.rowDelete}
        onClick={() => onDelete(item.id)}
        aria-label="Delete item"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

/* ─── Main component ──────────────────────────────── */
export default function Dashboard({ items, onRecordPress, onDeleteItem }) {
  const grouped  = groupItems(items);
  const dates    = Object.keys(grouped);
  const total    = items.length;
  const taskCnt  = items.filter((i) => i.type === "task").length;
  const eventCnt = items.filter((i) => i.type === "event").length;
  const remCnt   = items.filter((i) => i.type === "reminder").length;
  const isEmpty  = total === 0;

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>Voxie</div>
        <div className={styles.date}>{todayStr()}</div>
      </div>

      {/* Scroll area */}
      <div className={styles.scroll}>

        {/* Summary chips */}
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

        {isEmpty ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎙</div>
            <div className={styles.emptyTitle}>Nothing here yet</div>
            <div className={styles.emptySub}>
              Tap Record to speak your tasks, events and reminders
            </div>
            <button className={styles.emptyBtn} onClick={onRecordPress}>
              Start Recording
            </button>
          </div>
        ) : (
          dates.map((dateKey) => {
            const grp = grouped[dateKey];
            const allInDate = [
              ...grp.events,
              ...grp.tasks,
              ...grp.reminders,
              ...grp.notes,
            ];
            if (allInDate.length === 0) return null;
            return (
              <div key={dateKey} className={styles.dateGroup}>
                {/* Date separator */}
                <div className={styles.dateLabel}>{dateLabel(dateKey)}</div>

                {grp.events.length > 0 && (
                  <>
                    <div className={styles.sec}>Events</div>
                    {grp.events.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} />
                    ))}
                  </>
                )}
                {grp.tasks.length > 0 && (
                  <>
                    <div className={styles.sec}>Tasks</div>
                    {grp.tasks.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} />
                    ))}
                  </>
                )}
                {grp.reminders.length > 0 && (
                  <>
                    <div className={styles.sec}>Reminders</div>
                    {grp.reminders.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} />
                    ))}
                  </>
                )}
                {grp.notes.length > 0 && (
                  <>
                    <div className={styles.sec}>Notes</div>
                    {grp.notes.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} />
                    ))}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Floating mic */}
      {!isEmpty && (
        <button className={styles.fab} onClick={onRecordPress} aria-label="New recording">
          🎙
        </button>
      )}
    </div>
  );
}
