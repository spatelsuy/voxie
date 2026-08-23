import { useState, useRef } from "react";
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

const API_URL      = "/api/transcribe";       // audio → transcribe+analyse (fallback)
const TEXT_API_URL = "/api/transcribe-text";  // text  → analyse only (preferred)

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
              <button className={styles.dialogBtnKeep} onClick={onNo}>
                Delete Recording Only
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

/* ─── Helpers ─────────────────────────────────────── */
/** Build the date suffix string from a Date object — matches how names are originally created. */
function dateSuffix(createdAt) {
  return " " + createdAt.toLocaleString("en-US", {
    month: "short", day: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

/**
 * Extract the editable prefix from a stored name.
 * The date suffix always starts at the first space followed by a 3-letter month
 * abbreviation (Jan–Dec). Everything before that is the user's label.
 * Falls back to splitting on the first space for legacy single-word names.
 */
function extractPrefix(name) {
  const monthRe = / (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
  const m = monthRe.exec(name);
  if (m) return name.slice(0, m.index);
  // fallback: split on first space
  const spaceIdx = name.indexOf(" ");
  return spaceIdx === -1 ? name : name.slice(0, spaceIdx);
}

/* ─── Component ───────────────────────────────────── */
export default function HistoryList({
  recordings, a2tResults, a2tStatuses, items, dbWarning,
  onDelete, onRename, onSaveA2T, onMarkFailed,
}) {
  const [expandedA2T, setExpandedA2T] = useState({});
  const [a2tLoading,  setA2tLoading]  = useState({});
  const [confirmFor,  setConfirmFor]  = useState(null);
  const [editingId,   setEditingId]   = useState(null);   // id of card whose prefix is being edited
  const [editValue,   setEditValue]   = useState("");     // current text in the edit input
  const inputRef = useRef(null);

  /* Transcribe a single recording */
  async function transcribeRec(rec) {
    if (rec.kind === "text") {
      setExpandedA2T((p) => ({ ...p, [rec.id]: true }));
      return;
    }

    setA2tLoading((p) => ({ ...p, [rec.id]: true }));
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    try {
      let data;

      if (rec.text) {
        // Transcript already saved — send text directly for analysis, no re-transcription needed
        const formData = new FormData();
        formData.append("user_name",   "SunilK");
        formData.append("client_time", formattedDate);
        formData.append("text",        rec.text);
        const res = await fetch(TEXT_API_URL, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        data = await res.json();
        // Preserve the saved transcript inside the A2T result
        data = { ...data, transcription_text: rec.text };
      } else {
        // No saved transcript — fall back to full audio re-transcription
        const formData = new FormData();
        formData.append("user_name",   "SunilK");
        formData.append("client_time", formattedDate);
        formData.append("file",        rec.blob, "recording.webm");
        const res = await fetch(API_URL, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        data = await res.json();
      }

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

  /* ── Inline prefix editing ── */
  function startEditing(rec) {
    setEditingId(rec.id);
    setEditValue(extractPrefix(rec.name));
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit(id) {
    const trimmed = editValue.trim();
    if (trimmed && onRename) onRename(id, trimmed);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
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
        <div className={styles.headerLeft}>
          <div className={styles.title}>History</div>
          <div className={styles.sub}>Recordings &amp; A2T results</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/K_Logo.png" alt="Kahija" className={styles.headerLogo} />
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
            const a              = a2tResults[r.id]?.analysis;
            const activityCount  = (a?.tasks || []).length + (a?.events || []).length + (a?.reminders || []).length;
            const noteCount      = (a?.notes || []).length;
            const isTextEntry    = r.kind === "text";

            const prefix    = extractPrefix(r.name);
            const suffix    = dateSuffix(r.createdAt);
            const isEditing = editingId === r.id;

            return (
              <div key={r.id} className={styles.card}>
                <div className={styles.cardName}>
                  {isEditing ? (
                    <span className={styles.cardNameEdit}>
                      <input
                        ref={inputRef}
                        className={styles.prefixInput}
                        value={editValue}
                        maxLength={16}
                        autoFocus
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEdit(r.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={() => commitEdit(r.id)}
                        aria-label="Edit label"
                      />
                      <span className={styles.cardNameDate}>{suffix}</span>
                    </span>
                  ) : (
                    <span className={styles.cardNameEdit}>
                      <span
                        className={styles.prefixLabel}
                        onClick={() => startEditing(r)}
                        title="Click to rename"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && startEditing(r)}
                      >{prefix}</span>
                      <span className={styles.cardNameDate}>{suffix}</span>
                    </span>
                  )}
                </div>
                <div className={styles.cardMeta}>
                  <span>
                    {isTextEntry
                      ? `${formatSize(r.size)} • typed entry • ${r.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : `${formatSize(r.size)} • ${formatDuration(r.duration)} • ${r.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                  {hasResult && (activityCount > 0 || noteCount > 0) && (
                    <>
                      <span className={styles.cardMetaPipe}>|</span>
                      {activityCount > 0 && <span className={`${styles.tag} ${styles.tagActivity}`}>{activityCount} activit{activityCount > 1 ? "ies" : "y"}</span>}
                      {noteCount     > 0 && <span className={`${styles.tag} ${styles.tagNote}`}>{noteCount} note{noteCount > 1 ? "s" : ""}</span>}
                    </>
                  )}
                </div>

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
                  {!isTextEntry && <audio controls src={r.url} className={styles.audioInline} />}
                  <button
                    className={`${styles.btnA2t} ${isFailed && !hasResult ? styles.btnA2tFailed : ""}`}
                    onClick={() => hasResult ? togglePanel(r.id) : transcribeRec(r)}
                    disabled={isLoading || isPending}
                    aria-label={
                      isLoading || isPending
                        ? "Loading"
                        : hasResult
                          ? (isExpanded ? "Hide" : (isTextEntry ? "View text" : "View A2T"))
                          : isFailed ? "Retry" : "A2T"
                    }
                  >
                    {isLoading || isPending
                      ? "…"
                      : hasResult
                        ? (isExpanded
                            ? (
                              // Eye with cross line ("Hide")
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                <line x1="2" y1="2" x2="22" y2="22" />
                              </svg>
                            )
                            : (
                              // Plain eye ("View A2T" / "View text")
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )
                          )
                        : isFailed  ? "Retry" : "A2T"}
                  </button>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  
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
