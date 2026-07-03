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
function ConfirmDialog({ recording, itemCount, onYes, onNo, onCancel }) {
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
              <button className={styles.dialogBtnSecondary} onClick={onCancel}>
                Cancel
              </button>
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
            <button className={styles.dialogBtnSecondary} onClick={onCancel}>
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
  recordings, a2tResults, a2tStatuses, items, dbWarning,
  onDelete, onSaveA2T, onMarkFailed,
}) {
  const [expandedA2T, setExpandedA2T] = useState({});
  const [a2tLoading,  setA2tLoading]  = useState({});
  const [confirmFor,  setConfirmFor]  = useState(null);

  /* Transcribe a single recording */
  async function transcribeRec(rec) {
    if (rec.kind === "text") {
      setExpandedA2T((p) => ({ ...p, [rec.id]: true }));
      return;
    }

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

  function handleDeleteClick(rec) {
    const itemCount = items.filter((i) => i.sourceRecordingId === rec.id).length;
    setConfirmFor({ recording: rec, itemCount });
  }

  function handleConfirmYes() {
    if (!confirmFor) return;
    onDelete(confirmFor.recording.id, true);   // delete recording + organiser items
    setConfirmFor(null);
  }

  function handleConfirmNo() {
    if (!confirmFor) return;
    onDelete(confirmFor.recording.id, false);  // delete recording, keep organiser items
    setConfirmFor(null);
  }

  function handleConfirmCancel() {
    setConfirmFor(null);                       // dismiss — delete nothing
  }

  const warnClass =
    dbWarning?.level === "critical" ? styles.warnCritical :
    dbWarning?.level === "warn"     ? styles.warnWarn     :
                                      styles.warnNormal;

  return (
    <div className={styles.wrap}>
      {confirmFor && (
        <ConfirmDialog
          recording={confirmFor.recording}
          itemCount={confirmFor.itemCount}
          onYes={handleConfirmYes}
          onNo={handleConfirmNo}
          onCancel={handleConfirmCancel}
        />
      )}

      <div className={styles.header}>
        <div className={styles.title}>History</div>
        <div className={styles.sub}>Recordings &amp; A2T results</div>
      </div>

      {dbWarning && (
        <div className={`${styles.warn} ${warnClass}`}>{dbWarning.text}</div>
      )}

      <div className={styles.list}>
        {recordings.length === 0 ? (
          <div className={styles.empty}>No recordings yet. Tap Record to start.</div>
        ) : (
          [...recordings].reverse().map((r) => {
            const hasResult   = !!a2tResults[r.id];
            const isExpanded  = !!expandedA2T[r.id];
            const isLoading   = !!a2tLoading[r.id];
            const a2tStatus   = a2tStatuses?.[r.id]; // "pending"|"done"|"failed"|undefined
            const isPending   = a2tStatus === "pending";
            const isFailed    = a2tStatus === "failed";
            const a           = a2tResults[r.id]?.analysis;
            const taskCount     = (a?.tasks     || []).length;
            const eventCount    = (a?.events    || []).length;
            const reminderCount = (a?.reminders || []).length;
            const isTextEntry   = r.kind === "text";

            return (
              <div key={r.id} className={styles.card}>
                <div className={styles.cardName}>{r.name}</div>
                <div className={styles.cardMeta}>
                  {isTextEntry
                    ? `${formatSize(r.size)} • typed entry • ${r.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : `${formatSize(r.size)} • ${formatDuration(r.duration)} • ${r.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                </div>

                {/* Tags — only when A2T result exists */}
                {hasResult && (
                  <div className={styles.tags}>
                    {taskCount     > 0 && <span className={`${styles.tag} ${styles.tagTask}`}>{taskCount} task{taskCount > 1 ? "s" : ""}</span>}
                    {eventCount    > 0 && <span className={`${styles.tag} ${styles.tagEvent}`}>{eventCount} event{eventCount > 1 ? "s" : ""}</span>}
                    {reminderCount > 0 && <span className={`${styles.tag} ${styles.tagReminder}`}>{reminderCount} reminder{reminderCount > 1 ? "s" : ""}</span>}
                  </div>
                )}

                {/* Status badge for pending/failed — shown above buttons */}
                {(isPending || isFailed) && !hasResult && (
                  <div className={isFailed ? styles.statusFailed : styles.statusPending}>
                    {isPending ? "⏳ Analysing — please wait…" : "⚠️ Analysis failed"}
                    {isFailed && (
                      <button
                        className={styles.retryLink}
                        onClick={() => { if (onMarkFailed) onMarkFailed(r.id); transcribeRec(r); }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Buttons + audio — always visible */}
                <div className={styles.btnGroup}>
                  {!isTextEntry && (
                    <button className={styles.btnPlay} onClick={() => downloadFile(r.url)}>
                      Download
                    </button>
                  )}
                  <button
                    className={`${styles.btnA2t} ${isFailed && !hasResult ? styles.btnA2tFailed : ""}`}
                    onClick={() => hasResult ? togglePanel(r.id) : transcribeRec(r)}
                    disabled={isLoading || isPending}
                  >
                    {isLoading || isPending
                      ? "…"
                      : hasResult
                        ? (isExpanded ? "Hide" : "View A2T")
                        : isFailed
                          ? "Retry"
                          : isTextEntry ? "View text" : "A2T"}
                  </button>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  {!isTextEntry && <audio controls src={r.url} className={styles.audioInline} />}
                  <button className={styles.btnDelete} onClick={() => handleDeleteClick(r)}>
                    Delete
                  </button>
                </div>
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
