import styles from "../styles/response.module.css";

/* ─── Helpers ─────────────────────────────────────── */
function priorityClass(p) {
  if (p === "high")   return styles.priorityHigh;
  if (p === "medium") return styles.priorityMedium;
  return styles.priorityLow;
}

/* ─── Single activity/note item ───────────────────── */
function Item({ item, typeLabel }) {
  return (
    <div className={styles.item}>
      <div className={styles.itemTop}>
        <div className={styles.itemTitle}>{item.title}</div>
        <div className={styles.itemTopRight}>
          {typeLabel && (
            <span className={`${styles.typeTag} ${styles[`type_${typeLabel.toLowerCase()}`]}`}>
              {typeLabel}
            </span>
          )}
          <div
            className={`${styles.priorityDot} ${priorityClass(item.priority)}`}
            title={`Priority: ${item.priority}`}
          />
        </div>
      </div>
      {(item.time || item.is_deadline || item.related_to || item.context ||
        (item.recurrence && item.recurrence.is_recurring)) && (
        <div className={styles.itemMeta}>
          {item.recurrence && item.recurrence.is_recurring && (
            <span className={`${styles.tag} ${styles.recurrence}`}>
              &#9851; {item.recurrence.frequency} | {item.recurrence.day_of_week}
            </span>
          )}
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

/* ─── A section card (Activities or Notes) ────────── */
function SectionCard({ icon, title, theme, children, count }) {
  return (
    <div className={`${styles.sectionCard} ${theme}`}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionIcon}>{icon}</div>
        <div className={styles.sectionTitle}>{title}</div>
        <div className={styles.sectionCount}>{count}</div>
      </div>
      <div className={styles.itemsList}>{children}</div>
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

  // Merge tasks + events + reminders into one Activities list,
  // tagging each item with its origin type for the pill label.
  const activities = [
    ...(a?.tasks     || []).map((i) => ({ ...i, _type: "Task"     })),
    ...(a?.events    || []).map((i) => ({ ...i, _type: "Event"    })),
    ...(a?.reminders || []).map((i) => ({ ...i, _type: "Reminder" })),
  ];
  const notes = a?.notes || [];
  const total = activities.length + notes.length;

  return (
    <div className={styles.response}>
      <div className={styles.plannerHeader}>
        <h2>Activities</h2>
        <div className={styles.sub}>{dateStr}</div>
      </div>

      <div className={styles.transcriptionCard}>
        <div className={styles.cardLabel}>📝 Original Transcript</div>
        <p>{data.transcription || data.transcription_text || "—"}</p>
      </div>

      <div className={styles.sectionsGrid}>
        {activities.length > 0 && (
          <SectionCard
            icon="⚡"
            title="Activities"
            theme={styles.themeActivities}
            count={activities.length}
          >
            {activities.map((item, i) => (
              <Item key={i} item={item} />
            ))}
          </SectionCard>
        )}
        {notes.length > 0 && (
          <SectionCard
            icon="📝"
            title="Notes"
            theme={styles.themeNotes}
            count={notes.length}
          >
            {notes.map((item, i) => (
              <Item key={i} item={item} typeLabel={null} />
            ))}
          </SectionCard>
        )}
        {activities.length === 0 && notes.length === 0 && (
          <div className={styles.emptySection}>No activities extracted.</div>
        )}
      </div>

      <div className={styles.metaBar}>
        <div className={styles.statusDot} />
        {total} item{total !== 1 ? "s" : ""} extracted &middot; User: {data.user || "—"} &middot;
        Status: {data.status}
      </div>
    </div>
  );
}
