import styles from "../styles/dashboard.module.css";

/* ─── Helpers ─────────────────────────────────────── */
function todayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d   = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate()
  );
}

function priorityDotClass(p) {
  if (p === "high")   return styles.dotHigh;
  if (p === "medium") return styles.dotMed;
  return styles.dotLow;
}

/* ─── Aggregate all A2T data ──────────────────────── */
function aggregate(a2tResults) {
  const tasks     = [];
  const events    = [];
  const reminders = [];

  Object.values(a2tResults).forEach((data) => {
    const a = data?.analysis;
    if (!a) return;
    (a.tasks     || []).forEach((i) => tasks.push(i));
    (a.events    || []).forEach((i) => events.push(i));
    (a.reminders || []).forEach((i) => reminders.push(i));
  });

  // Sort events/reminders by time if available
  const byTime = (a, b) => (a.time || "").localeCompare(b.time || "");
  events.sort(byTime);
  reminders.sort(byTime);

  // Sort tasks: high → medium → low
  const PRIO = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => (PRIO[a.priority] ?? 2) - (PRIO[b.priority] ?? 2));

  return { tasks, events, reminders };
}

/* ─── Sub-components ──────────────────────────────── */
function Chip({ num, label, cls }) {
  return (
    <div className={`${styles.chip} ${cls}`}>
      <div className={styles.chipNum}>{num}</div>
      <div className={styles.chipLbl}>{label}</div>
    </div>
  );
}

function EventRow({ item }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon}>📅</span>
      <span className={styles.rowText}>{item.title}</span>
      {item.time && <span className={styles.rowTime}>{item.time}</span>}
    </div>
  );
}

function TaskRow({ item }) {
  return (
    <div className={styles.row}>
      <div className={`${styles.dot} ${priorityDotClass(item.priority)}`} />
      <span className={styles.rowText}>{item.title}</span>
      {item.context && <span className={styles.rowTag}>{item.context}</span>}
    </div>
  );
}

function ReminderRow({ item }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon}>🔔</span>
      <span className={styles.rowText}>{item.title}</span>
      {item.time && <span className={styles.rowTime}>{item.time}</span>}
    </div>
  );
}

/* ─── Main component ──────────────────────────────── */
export default function Dashboard({ a2tResults, onRecordPress }) {
  const { tasks, events, reminders } = aggregate(a2tResults);
  const isEmpty = tasks.length + events.length + reminders.length === 0;

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
          <Chip num={tasks.length}     label="Tasks"     cls={styles.chipTask} />
          <Chip num={events.length}    label="Events"    cls={styles.chipEvent} />
          <Chip num={reminders.length} label="Reminders" cls={styles.chipReminder} />
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
          <>
            {events.length > 0 && (
              <>
                <div className={styles.sec}>Events</div>
                {events.map((item, i) => <EventRow key={i} item={item} />)}
              </>
            )}

            {tasks.length > 0 && (
              <>
                <div className={styles.sec}>Tasks</div>
                {tasks.map((item, i) => <TaskRow key={i} item={item} />)}
              </>
            )}

            {reminders.length > 0 && (
              <>
                <div className={styles.sec}>Reminders</div>
                {reminders.map((item, i) => <ReminderRow key={i} item={item} />)}
              </>
            )}
          </>
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
