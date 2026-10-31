/**
 * ExportICSModal
 *
 * Preview modal before exporting activities.
 *
 * Three sections shown to the user:
 *   1. ✅ Will be exported  — activities with a parseable date/time
 *   2. 📅 All-day (no time) — activities with no time → exported on recording date
 *   3. ⚠️ Needs fix         — time string exists but cannot be parsed → excluded,
 *                             user directed to Inbox to correct
 *
 * Done items and notes are silently excluded (count shown in footer).
 *
 * Actions (bottom bar):
 *   - Download .ics           — always available
 *   - Push to Google Calendar — only when isSignedIn === true
 *
 * Each exportable item has a checkbox. A global select-all toggle sits in the
 * section header. needsFix items have no checkbox (can't be exported).
 */

import { useMemo, useState } from "react";
import { classifyItems, buildICS, downloadICS } from "../lib/buildICS";
import { loadProfile, keyFingerprint } from "../lib/profileStore";
import styles from "../styles/exportICS.module.css";

function formatDate(date, allDay) {
  if (!date || isNaN(date.getTime())) return "—";
  if (allDay) {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Convert a Date back to "YYYY-MM-DD" for the all-day fallback sent to the API. */
function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ExportICSModal({ items, onClose, isSignedIn }) {
  const [downloaded,  setDownloaded]  = useState(false);
  const [pushState,   setPushState]   = useState(null);  // null | "pushing" | "done" | "error"
  const [pushMsg,     setPushMsg]     = useState("");
  const [emailState,  setEmailState]  = useState(null);  // null | "sending" | "done" | "error"
  const [emailMsg,    setEmailMsg]    = useState("");
  const [showEmail,   setShowEmail]   = useState(false);
  const [profileEmail, setProfileEmail] = useState(null);
  const [includeSelf, setIncludeSelf] = useState(true);
  const [otherEmails, setOtherEmails] = useState("");

  const { included, needsFix, excluded } = useMemo(() => classifyItems(items || []), [items]);

  // Initialise all included items as selected
  const [selected, setSelected] = useState(() => new Set(included.map((e) => e.item.id)));

  const withTime = included.filter((e) => !e.allDay);
  const allDay   = included.filter((e) =>  e.allDay);

  const doneCount = excluded.filter((e) => e.reason === "done").length;
  const noteCount = excluded.filter((e) => e.reason === "note").length;

  const allSelected  = included.length > 0 && selected.size === included.length;
  const someSelected = selected.size > 0;

  /* ── Selection helpers ── */
  function toggleItem(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(included.map((e) => e.item.id)));
    }
  }

  /* ── Actions ── */
  function handleDownload() {
    const toExport = included.filter((e) => selected.has(e.item.id));
    const ics = buildICS(toExport);
    downloadICS(ics);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  async function toggleEmailPanel() {
    const next = !showEmail;
    setShowEmail(next);
    if (next && profileEmail === null) {
      try {
        const { email } = await loadProfile();
        setProfileEmail(email || "");
      } catch {
        setProfileEmail("");
      }
    }
  }

  async function handleEmail() {
    const toExport = included.filter((e) => selected.has(e.item.id));
    if (toExport.length === 0) return;

    const to = otherEmails.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!includeSelf && to.length === 0) {
      setEmailState("error");
      setEmailMsg("Enter at least one recipient.");
      return;
    }

    setEmailState("sending");
    setEmailMsg("");
    try {
      const { email, cryptoKey, seal } = await loadProfile();
      if (!email || !cryptoKey || !seal) {
        throw new Error("Verify your email in Profile first.");
      }
      const res = await fetch("/api/export/email-ics", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          email,
          keyHash: await keyFingerprint(cryptoKey),
          seal,
          ics:     buildICS(toExport),
          count:   toExport.length,
          includeSelf,
          to,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setEmailState("done");
      setEmailMsg(`Sent to ${(body.sentTo || []).join(", ")}`);
    } catch (err) {
      console.error("[export] email ICS failed:", err);
      setEmailState("error");
      setEmailMsg(err.message);
    }
    setTimeout(() => { setEmailState(null); setEmailMsg(""); }, 5000);
  }

  async function handlePushToGoogle() {
    const toExport = included.filter((e) => selected.has(e.item.id));
    if (toExport.length === 0) return;

    setPushState("pushing");
    setPushMsg(`Pushing ${toExport.length} item${toExport.length !== 1 ? "s" : ""}…`);

    try {
      // Build the payload — pass allDayDate for items that have no time string
      const payload = toExport.map(({ item, date, allDay }) => ({
        id:         item.id,
        title:      item.title,
        context:    item.context || null,
        time:       item.time && item.time.trim() ? item.time.trim() : null,
        allDayDate: allDay ? toYMD(date) : null,
      }));

      const res  = await fetch("/api/calendar/push-all", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items: payload }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);

      const { pushed, errors } = body;
      if (errors && errors.length > 0) {
        console.error("[push-all] partial failures:", errors);
        setPushState("error");
        setPushMsg(`${pushed} pushed, ${errors.length} failed`);
      } else {
        setPushState("done");
        setPushMsg(`${pushed} item${pushed !== 1 ? "s" : ""} pushed ✓`);
      }
      setTimeout(() => { setPushState(null); setPushMsg(""); }, 5000);
    } catch (err) {
      console.error("[push-all] push to Google Calendar failed:", err);
      setPushState("error");
      setPushMsg(err.message);
      setTimeout(() => { setPushState(null); setPushMsg(""); }, 5000);
    }
  }

  /* ── Render helpers ── */
  function renderRows(entries) {
    return entries.map(({ item, date, allDay }) => (
      <li key={item.id} className={styles.row}>
        <label className={styles.rowCheckLabel}>
          <input
            type="checkbox"
            className={styles.rowCheck}
            checked={selected.has(item.id)}
            onChange={() => toggleItem(item.id)}
          />
          <span className={styles.rowTitle}>
            {item.title}
            {item.recurrence?.is_recurring === true && <span className={styles.rowRecurring}> (recurring)</span>}
          </span>
        </label>
        <span className={styles.rowDate}>{formatDate(date, allDay)}</span>
      </li>
    ));
  }

  const selectedCount      = selected.size;
  const selectedWithTime   = withTime.filter((e) => selected.has(e.item.id)).length;
  const selectedAllDay     = allDay.filter((e)   => selected.has(e.item.id)).length;
  const notEligibleCount   = needsFix.length;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Export Activities</div>
            <div className={styles.sub}>Downloads as .ics — imports into Outlook / Apple Calendar / Google Calendar</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>

          {/* ── Global select-all ── */}
          {included.length > 0 && (
            <div className={styles.selectAllRow}>
              <label className={styles.selectAllLabel}>
                <input
                  type="checkbox"
                  className={styles.rowCheck}
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleAll}
                />
                <span>{allSelected ? "Deselect all" : "Select all"}</span>
              </label>
              <span className={styles.selectedCount}>{selectedCount} selected</span>
            </div>
          )}

          {/* ── Selection summary bar ── */}
          {(included.length > 0 || needsFix.length > 0) && (
            <div className={styles.summaryBar}>
              <div className={styles.summaryItem}>
                Exporting: <span className={styles.summaryDot} style={{ background: "#22c55e" }} />
                <span><strong>{selectedWithTime}</strong> with date &amp; time</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryDot} style={{ background: "#3b82d4" }} />
                <span><strong>{selectedAllDay}</strong> all-day</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryDot} style={{ background: "#f59e0b" }} />
                <span><strong>{notEligibleCount}</strong> not eligible</span>
              </div>
            </div>
          )}

          {/* ── Section 1: With date/time ── */}
          {withTime.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionIcon}>✅</span>
                <span className={styles.sectionTitle}>Will be exported with date &amp; time</span>
                <span className={styles.sectionCount}>{withTime.length}</span>
              </div>
              <ul className={styles.list}>{renderRows(withTime)}</ul>
            </section>
          )}

          {/* ── Section 2: All-day (no time set) ── */}
          {allDay.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionIcon}>📅</span>
                <span className={styles.sectionTitle}>Will be exported as all-day (no time set)</span>
                <span className={styles.sectionCount}>{allDay.length}</span>
              </div>
              <div className={styles.sectionNote}>
                These activities have no time. They will appear as all-day events on the date they were recorded. To add a specific time, edit them in Inbox first.
              </div>
              <ul className={styles.list}>{renderRows(allDay)}</ul>
            </section>
          )}

          {/* ── Section 3: Needs fix ── */}
          {needsFix.length > 0 && (
            <section className={`${styles.section} ${styles.sectionWarning}`}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionIcon}>⚠️</span>
                <span className={styles.sectionTitle}>Cannot export — date not recognised</span>
                <span className={styles.sectionCount}>{needsFix.length}</span>
              </div>
              <div className={styles.sectionNote}>
                These activities have a date that could not be understood (e.g. "next Friday", "tomorrow"). Go to <strong>Inbox</strong>, edit each one and enter a date like <code>2025-07-10</code> or <code>2025-07-10 09:00</code>, then export again.
              </div>
              <ul className={styles.list}>
                {needsFix.map(({ item }) => (
                  <li key={item.id} className={`${styles.row} ${styles.rowWarn} ${styles.rowDisabled}`}>
                    <span className={styles.rowCheckPlaceholder} />
                    <span className={styles.rowTitle}>
                      {item.title}
                      {item.recurrence?.is_recurring === true && <span className={styles.rowRecurring}> (recurring)</span>}
                    </span>
                    <span className={styles.rowTime}>{item.time}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Empty state ── */}
          {included.length === 0 && needsFix.length === 0 && (
            <div className={styles.empty}>
              No activities to export.{doneCount > 0 ? ` ${doneCount} completed item${doneCount !== 1 ? "s" : ""} excluded.` : ""}
            </div>
          )}

          {/* ── Footer summary ── */}
          <div className={styles.footer}>
            {doneCount > 0 && (
              <div className={styles.footerNote}>
                {doneCount} completed activit{doneCount !== 1 ? "ies" : "y"} excluded from export.
              </div>
            )}
            {noteCount > 0 && (
              <div className={styles.footerNote}>
                {noteCount} note{noteCount !== 1 ? "s" : ""} excluded (notes are not calendar items).
              </div>
            )}
          </div>
        </div>

        {/* Email panel */}
        {showEmail && (
          <div className={styles.emailPanel}>
            <label className={styles.emailSelf}>
              <input
                type="checkbox"
                className={styles.rowCheck}
                checked={includeSelf}
                onChange={(e) => setIncludeSelf(e.target.checked)}
              />
              <span>
                Send to my registered email
                {profileEmail ? <strong> ({profileEmail})</strong> : null}
              </span>
            </label>
            {profileEmail === "" && (
              <div className={styles.emailMsgError}>No verified email found — verify your email in Profile first.</div>
            )}
            <input
              type="text"
              className={styles.emailInput}
              placeholder="Other emails (comma separated, max 5 total)"
              value={otherEmails}
              onChange={(e) => setOtherEmails(e.target.value)}
              autoComplete="off"
            />
            <button
              className={`${styles.downloadBtn} ${emailState === "done" ? styles.downloadBtnDone : ""}`}
              onClick={handleEmail}
              disabled={selectedCount === 0 || emailState === "sending"}
            >
              {emailState === "sending" ? "Sending…" : emailState === "done" ? "Sent ✓" : `Send (${selectedCount})`}
            </button>
          </div>
        )}

        {/* Actions */}
        {emailMsg && (
          <div className={`${styles.emailMsg} ${emailState === "error" ? styles.emailMsgError : ""}`}>
            {emailMsg}
          </div>
        )}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.downloadBtn} ${downloaded ? styles.downloadBtnDone : ""}`}
            onClick={handleDownload}
            disabled={selectedCount === 0}
          >
            {downloaded ? "Downloaded ✓" : `Download .ics (${selectedCount})`}
          </button>
          <button
            className={styles.emailBtn}
            onClick={toggleEmailPanel}
            disabled={selectedCount === 0}
          >
            {showEmail ? "Hide email" : "Email…"}
          </button>
          {/* Push to Google button hidden for now */}
        </div>

      </div>
    </div>
  );
}
