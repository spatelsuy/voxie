import { useState } from "react";
import styles from "../styles/history.module.css";
import ResponseDisplay from "./ResponseDisplay";

/* ─── Helpers ─────────────────────────────────────── */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(sec) {
  const min = Math.floor(sec / 60);
  const s   = sec % 60;
  return `${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const API_URL = "/api/transcribe";

/* ─── Confirmation dialog ─────────────────────────── */
function ConfirmDialog({ recording, itemCount, onYes, onNo }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.dialogTitle}>Delete Recording?</div>
        <div className={styles.dialogBody}>
          <p>
            <strong>{recording.name}</strong> will be permanently deleted.
          </p>
          {itemCount > 0 && (
            <p>
              This recording has <strong>{itemCount} organizer item{itemCount > 1 ? "s" : ""}</strong>{" "}
              (tasks, events, reminders) saved in your Organizer.
            </p>
          )}
        </div>
        {itemCount > 0 ? (
          <>
            <div className={styles.dialogHint}>
              Also delete the {itemCount} item{itemCount > 1 ? "s" : ""} from your Organizer?
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogBtnSecondary} onClick={onNo}>
                Keep items
              </button>
              <button className={styles.dialogBtnDanger} onClick={onYes}>
                Delete everything
              </button>
            </div>
          </>
        ) : (
          <div className={styles.dialogActions}>
            <button className={styles.dialogBtnSecondary} onClick={onNo}>
              Cancel
            </button>
            <button className={styles.dialogBtnDanger} onClick={onYes}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Component ───────────────────────────────────── */
export default function HistoryList({
  recordings, a2tResults, items, dbWarning,
  onDelete, onSaveA2T,
}) {
  const [expandedA2T, setExpandedA2T] = useState({});
  const [a2tLoading,  setA2tLoading]  = useState({});
  // confirm dialog state: null | { recording, itemCount }
  const [confirmFor,  setConfirmFor]  = useState(null);

  /* Transcribe a single recording */
  async function transcribeRec(rec) {
    setA2tLoading((p) => ({ ...p, [rec.id]: true }));
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const formData = new FormData();
    formData.append("user_name", "SunilK");
    formData.append("client_time", formattedDate);
    formData.append("file", rec.blob, "recording.webm");
    try {
      const res = await fetch(API_URL, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      // Pass recording date so items can be grouped by date in Dashboard
      await onSaveA2T(rec.id, data, rec.createdAt.toDateString());
      setExpandedA2T((p) => ({ ...p, [rec.id]: true }));
    } catch (err) {
      alert(err.message);
      console.error(err);
    } finally {
      setA2tLoading((p) => ({ ...p, [rec.id]: false }));
    }
  }

  function togglePanel(id) {
    setExpandedA2T((p) => ({ ...p, [id]: !p[id] }));
  }

  function downloadFile(url) {
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "recording.webm";
    a.click();
  }

  /* Tap Delete → show confirmation dialog */
  function handleDeleteClick(rec) {
    const itemCount = items.filter((i) => i.sourceRecordingId === rec.id).length;
    setConfirmFor({ recording: rec, itemCount });
  }

  /* User confirmed — delete recording, optionally also items */
  function handleConfirmYes() {
    if (!confirmFor) return;
    onDelete(confirmFor.recording.id, true); // true = also delete items
    setConfirmFor(null);
  }

  /* User chose "Keep items" — delete only recording + raw JSON */
  function handleConfirmNo() {
    if (!confirmFor) return;
    onDelete(confirmFor.recording.id, false); // false = keep items
    setConfirmFor(null);
  }

  /* DB warning class */
  const warnClass =
    dbWarning?.level === "critical" ? styles.warnCritical :
    dbWarning?.level === "warn"     ? styles.warnWarn     :
                                      styles.warnNormal;

  return (
    <div className={styles.wrap}>
      {/* Confirmation dialog — rendered above everything */}
      {confirmFor && (
        <ConfirmDialog
          recording={confirmFor.recording}
          itemCount={confirmFor.itemCount}
          onYes={handleConfirmYes}
          onNo={handleConfirmNo}
        />
      )}

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>History</div>
        <div className={styles.sub}>Recordings &amp; A2T results</div>
      </div>

      {/* DB warning banner */}
      {dbWarning && (
        <div className={`${styles.warn} ${warnClass}`}>{dbWarning.text}</div>
      )}

      {/* List */}
      <div className={styles.list}>
        {recordings.length === 0 ? (
          <div className={styles.empty}>No recordings yet. Tap Record to start.</div>
        ) : (
          [...recordings].reverse().map((r) => {
            const hasResult  = !!a2tResults[r.id];
            const isExpanded = !!expandedA2T[r.id];
            const isLoading  = !!a2tLoading[r.id];
            const a          = a2tResults[r.id]?.analysis;
            const taskCount     = (a?.tasks     || []).length;
            const eventCount    = (a?.events    || []).length;
            const reminderCount = (a?.reminders || []).length;

            return (
              <div key={r.id} className={styles.card}>
                <div className={styles.cardName}>{r.name}</div>
                <div className={styles.cardMeta}>
                  {formatSize(r.size)} &bull; {formatDuration(r.duration)} &bull;{" "}
                  {r.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>

                {/* Result tags */}
                {hasResult && (
                  <div className={styles.tags}>
                    {taskCount     > 0 && <span className={`${styles.tag} ${styles.tagTask}`}>{taskCount} task{taskCount > 1 ? "s" : ""}</span>}
                    {eventCount    > 0 && <span className={`${styles.tag} ${styles.tagEvent}`}>{eventCount} event{eventCount > 1 ? "s" : ""}</span>}
                    {reminderCount > 0 && <span className={`${styles.tag} ${styles.tagReminder}`}>{reminderCount} reminder{reminderCount > 1 ? "s" : ""}</span>}
                  </div>
                )}

                {/* Audio player */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio controls src={r.url} className={styles.audio} />

                {/* Actions */}
                <div className={styles.actions}>
                  <button className={styles.btnPlay} onClick={() => downloadFile(r.url)}>
                    Download
                  </button>
                  <button
                    className={styles.btnA2t}
                    onClick={() => hasResult ? togglePanel(r.id) : transcribeRec(r)}
                    disabled={isLoading}
                  >
                    {isLoading ? "…" : hasResult ? (isExpanded ? "Hide" : "View A2T") : "A2T"}
                  </button>
                  <button className={styles.btnDelete} onClick={() => handleDeleteClick(r)}>
                    Delete
                  </button>
                </div>

                {/* Inline A2T panel */}
                {hasResult && isExpanded && (
                  <div className={styles.a2tPanel}>
                    <ResponseDisplay data={a2tResults[r.id]} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
