import { useEffect, useState } from "react";
import OnboardingPanel from "./OnboardingPanel";
import styles from "../styles/dashboard.module.css";

const STATUS_COMPLETED = "completed";
const STATUS_INPROGRESS = "inprogress";
const PRIORITY_OPTIONS = ["high", "medium", "low"];

/* ─── Helpers ─────────────────────────────────────── */
function todayStr() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function dateLabel(dateStr) {
  return "Inbox";
  /*
  // The below code will be used later
  if (!dateStr) return "";
  const d   = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth()    === now.getMonth()    &&
    d.getDate()     === now.getDate();
  if (isToday) return "Today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  */
  }

function rowTypeClass(type) {
  if (type === "task") return styles.rowTask;
  if (type === "event") return styles.rowEvent;
  if (type === "reminder") return styles.rowReminder;
  return styles.rowNote;
}

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

function EditItemModal({ item, onSave, onClose }) {
  const [title, setTitle] = useState(item.title || "");
  const [time, setTime] = useState(item.time || "");
  const [priority, setPriority] = useState(item.priority || "low");
  const [context, setContext] = useState(item.context || "");

  function handleSave() {
    onSave(item.id, {
      title: title.trim() || item.title,
      time: time.trim() || null,
      priority: item.type === "note" ? item.priority : priority,
      context: context.trim() || null,
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
            <span className={styles.fieldLabel}>Time</span>
            <input className={styles.input} value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        )}
        {item.type !== "note" && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Priority</span>
            <select className={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Context</span>
          <input className={styles.input} value={context} onChange={(e) => setContext(e.target.value)} />
        </label>
        <div className={styles.modalActions}>
          <button className={styles.modalBtnSecondary} onClick={onClose}>Cancel</button>
          <button className={styles.modalBtnPrimary} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Single item row ─────────────────────────────── */
function ItemRow({ item, onDelete, onStatusChange, onEdit }) {
  const [status, setStatus] = useState(item.status || STATUS_INPROGRESS);
  const isCompleted = status === STATUS_COMPLETED;

  useEffect(() => {
    setStatus(item.status || STATUS_INPROGRESS);
  }, [item.status]);

  async function handleStatusToggle() {
    const nextStatus = isCompleted ? STATUS_INPROGRESS : STATUS_COMPLETED;
    setStatus(nextStatus);
    await onStatusChange(item.id, nextStatus);
  }

  return (
    <div className={`${styles.row} ${rowTypeClass(item.type)} ${isCompleted ? styles.rowCompleted : ""}`}>
      <button
        className={`${styles.rowStatus} ${isCompleted ? styles.rowStatusDone : ""}`}
        onClick={handleStatusToggle}
        aria-label={isCompleted ? "Mark item as in progress" : "Mark item as completed"}
        title={isCompleted ? "Mark as in progress" : "Mark as completed"}
      />
      <div className={styles.rowMain}>
        <span className={styles.rowText}>{item.title}</span>
        {item.time && <span className={styles.rowTime}>{item.time}</span>}
      </div>
      <button
        className={styles.rowEdit}
        onClick={() => onEdit(item)}
        aria-label="Edit item"
        title="Edit"
      >
        •••
      </button>
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
export default function Dashboard({ items, onRecordPress, onDeleteItem, onStatusChange, onEditItem, showCompletedItems }) {
  const [editingItem, setEditingItem] = useState(null);
  const visibleItems = showCompletedItems
    ? items
    : items.filter((item) => item.status !== STATUS_COMPLETED);
  const grouped  = groupItems(visibleItems);
  const dates    = Object.keys(grouped);
  const total    = visibleItems.length;
  const taskCnt  = visibleItems.filter((i) => i.type === "task").length;
  const eventCnt = visibleItems.filter((i) => i.type === "event").length;
  const remCnt   = visibleItems.filter((i) => i.type === "reminder").length;
  const isEmpty  = total === 0;

  return (
    <div className={styles.wrap}>
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onSave={onEditItem}
          onClose={() => setEditingItem(null)}
        />
      )}
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
          <div className={styles.emptyStateWrap}>
            <OnboardingPanel onAction={onRecordPress} />
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
                {/* <div className={styles.dateLabel}>{dateLabel(dateKey)}</div> */}
                {grp.events.length > 0 && (
                  <>
                    <div className={styles.sec}>Events</div>
                    {grp.events.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} onStatusChange={onStatusChange} onEdit={setEditingItem} />
                    ))}
                  </>
                )}
                {grp.tasks.length > 0 && (
                  <>
                    <div className={styles.sec}>Tasks</div>
                    {grp.tasks.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} onStatusChange={onStatusChange} onEdit={setEditingItem} />
                    ))}
                  </>
                )}
                {grp.reminders.length > 0 && (
                  <>
                    <div className={styles.sec}>Reminders</div>
                    {grp.reminders.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} onStatusChange={onStatusChange} onEdit={setEditingItem} />
                    ))}
                  </>
                )}
                {grp.notes.length > 0 && (
                  <>
                    <div className={styles.sec}>Notes</div>
                    {grp.notes.map((item) => (
                      <ItemRow key={item.id} item={item} onDelete={onDeleteItem} onStatusChange={onStatusChange} onEdit={setEditingItem} />
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
