import styles from "../styles/response.module.css";

/* ─── Config ──────────────────────────────────────── */
const SECTION_CONFIG = {
  tasks:     { label: "Tasks",     icon: "✅", theme: styles.themeTasks },
  events:    { label: "Events",    icon: "📅", theme: styles.themeEvents },
  reminders: { label: "Reminders", icon: "🔔", theme: styles.themeReminders },
  notes:     { label: "Notes",     icon: "📝", theme: styles.themeNotes },
};

/* ─── Helpers ─────────────────────────────────────── */
function priorityClass(p) {
  if (p === "high")   return styles.priorityHigh;
  if (p === "medium") return styles.priorityMedium;
  return styles.priorityLow;
}

/* ─── Item ────────────────────────────────────────── */
function Item({ item }) {
  return (
    <div className={styles.item}>
      <div className={styles.itemTop}>
        <div className={styles.itemTitle}>{item.title}</div>
        <div
          className={`${styles.priorityDot} ${priorityClass(item.priority)}`}
          title={`Priority: ${item.priority}`}
        />
      </div>
      {(item.time || item.is_deadline || item.related_to || item.context) && (
        <div className={styles.itemMeta}>
          {item.time && (
            <span className={`${styles.tag} ${styles.tagTime}`}>
              🕐 {item.time}
            </span>
          )}
          {item.is_deadline && (
            <span className={`${styles.tag} ${styles.tagDeadline}`}>
              ⚑ Deadline
            </span>
          )}
          {item.related_to && (
            <span className={`${styles.tag} ${styles.tagRelated}`}>
              ↗ {item.related_to}
            </span>
          )}
          {item.context && (
            <span className={`${styles.tag} ${styles.tagContext}`}>
              {item.context}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Section ─────────────────────────────────────── */
function Section({ sectionKey, items }) {
  const cfg = SECTION_CONFIG[sectionKey];
  return (
    <div className={`${styles.sectionCard} ${cfg.theme}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}>{cfg.icon}</div>
        <div className={styles.sectionTitle}>{cfg.label}</div>
        <div className={styles.sectionCount}>{items.length}</div>
      </div>
      {items.length === 0 ? (
        <div className={styles.emptySection}>Nothing here</div>
      ) : (
        <div className={styles.itemsList}>
          {items.map((item, i) => (
            <Item key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main export ─────────────────────────────────── */
export default function ResponseDisplay({ data }) {
  if (!data) return null;

  const a = data.analysis;
  let dateStr = "";
  if (a?.extracted_on) {
    const d = new Date(a.extracted_on);
    dateStr = d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const total = ["tasks", "events", "reminders", "notes"].reduce(
    (sum, k) => sum + (a?.[k] || []).length,
    0
  );

  return (
    <div className={styles.response}>
      <div className={styles.plannerHeader}>
        <h2>My Day Planner</h2>
        <div className={styles.sub}>{dateStr}</div>
      </div>

      <div className={styles.transcriptionCard}>
        <div className={styles.cardLabel}>📝 Original Transcript</div>
        <p>{data.transcription || "—"}</p>
      </div>

      <div className={styles.sectionsGrid}>
        {["tasks", "events", "reminders", "notes"].map((k) => (
          <Section key={k} sectionKey={k} items={a?.[k] || []} />
        ))}
      </div>

      <div className={styles.metaBar}>
        <div className={styles.statusDot} />
        {total} items extracted &middot; User: {data.user || "—"} &middot;
        Status: {data.status}
      </div>
    </div>
  );
}
