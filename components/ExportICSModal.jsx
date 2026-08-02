/**
 * ExportICSModal
 *
 * Preview modal before exporting activities as an ICS file.
 *
 * Three sections shown to the user:
 *   1. ✅ Will be exported  — activities with a parseable date/time
 *   2. 📅 All-day (no time) — activities with no time → exported on recording date
 *   3. ⚠️ Needs fix         — time string exists but cannot be parsed → excluded,
 *                             user directed to Inbox to correct
 *
 * Done items and notes are silently excluded (count shown in footer).
 */

import { useMemo, useState } from "react";
import { classifyItems, buildICS, downloadICS } from "../lib/buildICS";
import styles from "../styles/exportICS.module.css";

function formatDate(date, allDay) {
  if (!date || isNaN(date.getTime())) return "—";
  if (allDay) {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  return date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ExportICSModal({ items, onClose }) {
  const [downloaded, setDownloaded] = useState(false);

  const { included, needsFix, excluded } = useMemo(() => classifyItems(items || []), [items]);

  const withTime  = included.filter(e => !e.allDay);
  const allDay    = included.filter(e =>  e.allDay);
  const doneCount = excluded.filter(e => e.reason === "done").length;
  const noteCount = excluded.filter(e => e.reason === "note").length;

  function handleDownload() {
    const ics = buildICS(included);
    downloadICS(ics);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <div>
            <div className={styles.title}>Export to Calendar</div>
            <div className={styles.sub}>Review before downloading the .ics file</div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.body}>

          {/* ── Section 1: With date/time ── */}
          {withTime.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionIcon}>✅</span>
                <span className={styles.sectionTitle}>Will be exported with date &amp; time</span>
                <span className={styles.sectionCount}>{withTime.length}</span>
              </div>
              <ul className={styles.list}>
                {withTime.map(({ item, date, allDay }) => (
                  <li key={item.id} className={styles.row}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={styles.rowDate}>{formatDate(date, allDay)}</span>
                  </li>
                ))}
              </ul>
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
                These activities have no time. They will appear as all-day to-dos on the date they were recorded. To add a specific time, edit them in Inbox first.
              </div>
              <ul className={styles.list}>
                {allDay.map(({ item, date }) => (
                  <li key={item.id} className={styles.row}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={styles.rowDate}>{formatDate(date, true)}</span>
                  </li>
                ))}
              </ul>
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
                  <li key={item.id} className={`${styles.row} ${styles.rowWarn}`}>
                    <span className={styles.rowTitle}>{item.title}</span>
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

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={`${styles.downloadBtn} ${downloaded ? styles.downloadBtnDone : ""}`}
            onClick={handleDownload}
            disabled={included.length === 0}
          >
            {downloaded ? "Downloaded ✓" : `Download .ics (${included.length} item${included.length !== 1 ? "s" : ""})`}
          </button>
        </div>

      </div>
    </div>
  );
}
