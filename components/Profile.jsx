import { useState, useEffect } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import styles from "../styles/profile.module.css";
import ExportICSModal from "./ExportICSModal";

export default function Profile({ onGetSyncData, onMergeSync, storageBackend, onSaveSetting, onClearLocalDB, items }) {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  const [syncJson,    setSyncJson]    = useState(null);
  const [jsonLoading, setJsonLoading] = useState(false);
  const [syncState,   setSyncState]   = useState(null); // null | "uploading" | "downloading" | "done" | "error"
  const [syncMsg,     setSyncMsg]     = useState("");
  const [clearState,      setClearState]      = useState(null);
  const [clearMsg,        setClearMsg]        = useState("");
  const [localClearState, setLocalClearState] = useState(null); // null | "confirm" | "clearing" | "done" | "error"
  const [showICSModal,    setShowICSModal]    = useState(false);

  const [calState, setCalState] = useState(null); // null | "pushing" | "deleting" | "done" | "error"
  const [calMsg,   setCalMsg]   = useState("");

  const backend = storageBackend || "drive";

  /* ── Auto sign-out when token refresh has failed ─── */
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      signOut({ redirect: false });
    }
  }, [session?.error]);

  /* ── View Sync JSON ───────────────────────────────── */
  async function handleViewSync() {
    setJsonLoading(true);
    try {
      const snapshot = await onGetSyncData();
      setSyncJson(JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.error("Failed to build sync snapshot:", err);
      setSyncJson('{ "error": "Failed to load data." }');
    } finally {
      setJsonLoading(false);
    }
  }

  /* ── Sync ─────────────────────────────────────────── */
  async function handleSync() {
    if (!isSignedIn) return;
    const url = `/api/sync?backend=${backend}`;
    try {
      // 1. Download first — pull any remote changes and merge
      setSyncState("downloading");
      setSyncMsg("Checking remote…");
      const dlRes = await fetch(url);
      let itemsReceived = 0;
      if (dlRes.ok) {
        const remote = await dlRes.json();
        const result = await onMergeSync(remote);
        itemsReceived = result.itemsUpdated;
      }
      // 404 = nothing stored yet — fine, upload will create it

      // 2. Upload merged local snapshot
      setSyncState("uploading");
      setSyncMsg("Uploading…");
      const snapshot  = await onGetSyncData();
      const uploadRes = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(snapshot),
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${uploadRes.status})`);
      }

      setSyncState("done");
      setSyncMsg(
        itemsReceived > 0
          ? `Synced ✓ — ${itemsReceived} item${itemsReceived !== 1 ? "s" : ""} pulled`
          : "Synced ✓ — up to date"
      );
      setTimeout(() => { setSyncState(null); setSyncMsg(""); }, 4000);
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncState("error");
      setSyncMsg(`Sync failed: ${err.message}`);
      setTimeout(() => { setSyncState(null); setSyncMsg(""); }, 5000);
    }
  }

  /* ── Clear stored data ────────────────────────────── */
  async function handleClearDrive() {
    setClearState("clearing");
    setClearMsg("");
    try {
      const res  = await fetch(`/api/sync?backend=${backend}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setClearState("done");
      setClearMsg(body.message || "Cleared ✓");
      setTimeout(() => { setClearState(null); setClearMsg(""); }, 4000);
    } catch (err) {
      setClearState("error");
      setClearMsg(`Error: ${err.message}`);
      setTimeout(() => { setClearState(null); setClearMsg(""); }, 5000);
    }
  }

  /* ── Clear local DB ───────────────────────────────── */
  async function handleClearLocal() {
    if (localClearState === null) {
      // First tap — show confirmation
      setLocalClearState("confirm");
      return;
    }
    if (localClearState === "confirm") {
      // Second tap — actually clear
      setLocalClearState("clearing");
      try {
        await onClearLocalDB();
        setLocalClearState("done");
        setTimeout(() => setLocalClearState(null), 3000);
      } catch (err) {
        console.error("Clear local DB failed:", err);
        setLocalClearState("error");
        setTimeout(() => setLocalClearState(null), 4000);
      }
    }
  }

  async function handleRemoveKahijaCalendar() {
    setCalState("deleting");
    try {
      const res = await fetch("/api/calendar/delete-all", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setCalState("done");
      setCalMsg(body.deleted ? "Kahija calendar removed ✓" : "No Kahija calendar found");
      setTimeout(() => { setCalState(null); setCalMsg(""); }, 4000);
    } catch (err) {
      console.error("[delete-kahija-calendar] failed:", err);
      setCalState("error");
      setCalMsg(`Error: ${err.message}`);
      setTimeout(() => { setCalState(null); setCalMsg(""); }, 5000);
    }
  }


  const syncBusy = syncState === "uploading" || syncState === "downloading";

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>Profile</div>
          <div className={styles.sub}>Sign in to sync and personalize your experience</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/K_Logo.png" alt="Kahija" className={styles.headerLogo} />
      </div>

      <div className={styles.body}>
        <div className={styles.card}>

          {/* ── Sign in / out ── */}
          <div className={styles.cardTitle}>
            {isSignedIn ? 
              `Signed in as ${session.user?.email || session.user?.name || "Google user"}` : "Login options"
            }
          </div>
          <div className={styles.cardText}>
            {!isSignedIn && (
              "Sign in to access your data anywhere, across devices."
            )}
          </div>

          {isSignedIn ? (
            <>
              {session?.error === "RefreshAccessTokenError" && (
                <div className={styles.tokenError}>
                  Session expired — please sign in again.
                </div>
              )}
              <button className={styles.googleBtn} onClick={() => signOut({ redirect: false })}>
                Sign out
              </button>
            </>
          ) : (
            <button className={styles.googleBtn} onClick={() => signIn("google", { redirect: false })}>
              Continue with Google
            </button>
          )}

          {/* ── Storage backend — Kahija DB only (Google Drive hidden for now) ── */}
          {isSignedIn && (
            <div className={styles.backendNote} style={{ marginTop: 12 }}>
              Storage: <strong>Kahija DB</strong> — end to end encrypted (in-transit and at-rest).
            </div>
          )}

          {/* ── Sync + Clear stored data — same row ── */}
          {isSignedIn && (
            <div className={styles.btnRow}>
              <button
                className={`${styles.syncBtn} ${
                  syncState === "done"  ? styles.syncBtnDone  :
                  syncState === "error" ? styles.syncBtnError : ""
                }`}
                onClick={handleSync}
                disabled={syncBusy}
              >
                {syncBusy
                  ? syncMsg
                  : syncState === "done"  ? syncMsg
                  : syncState === "error" ? syncMsg
                  : "Sync to Kahija DB"}
              </button>
              <button
                className={`${styles.clearDriveBtn} ${
                  clearState === "done"  ? styles.clearDriveBtnDone  :
                  clearState === "error" ? styles.clearDriveBtnError : ""
                }`}
                onClick={handleClearDrive}
                disabled={clearState === "clearing"}
              >
                {clearState === "clearing" ? "Clearing…" : clearState ? clearMsg : "Clear Stored Data"}
              </button>
            </div>
          )}
          {/* ── Clear local data — always visible, no sign-in required ── */}
          <div className={styles.sectionLabel} style={{ marginTop: 20 }}>
            Local storage
            <span className={styles.infoWrap}>
              <span className={styles.infoIcon}>ⓘ</span>
              <span className={styles.infoTooltip}>
                Removes all recordings, transcripts and activities stored on this device. Your settings are kept. This does not affect any cloud backup.
              </span>
            </span>
          </div>
          <button
            className={`${styles.clearLocalBtn} ${
              localClearState === "confirm" ? styles.clearLocalBtnConfirm :
              localClearState === "done"    ? styles.clearLocalBtnDone    :
              localClearState === "error"   ? styles.clearLocalBtnError   : ""
            }`}
            onClick={handleClearLocal}
            disabled={localClearState === "clearing" || localClearState === "done"}
          >
            {localClearState === "confirm"  ? "Tap again to confirm — this cannot be undone" :
             localClearState === "clearing" ? "Clearing…" :
             localClearState === "done"     ? "Local data cleared ✓" :
             localClearState === "error"    ? "Failed — try again" :
             "Clear Local Data"}
          </button>
          {localClearState === "confirm" && (
            <div className={styles.clearLocalNote} style={{ color: "#c2410c" }}>
              Tap the button above again to confirm. Or navigate away to cancel.
            </div>
          )}


          {/* ── Export to Calendar — always visible ── */}
          <div className={styles.sectionLabel} style={{ marginTop: 24 }}>
            Calendar export
            <span className={styles.infoWrap}>
              <span className={styles.infoIcon}>ⓘ</span>
              <span className={styles.infoTooltip}>
                Preview and download an ICS file you can import into Google Calendar, Apple Calendar, or Outlook.
              </span>
            </span>
          </div>
          <button
            className={styles.exportICSBtn}
            onClick={() => setShowICSModal(true)}
          >
            Export Activities to Calendar (.ics)
          </button>
          {/* Calendar sync section hidden for now */}



          {/* ── View Sync JSON ── */}
          {/*<button
            className={styles.syncJsonBtn}
            onClick={handleViewSync}
            disabled={jsonLoading}
          >
            {jsonLoading ? "Loading…" : "View Sync JSON"}
          </button> */}
        </div>
      </div>

      {/* ICS export modal */}
      {showICSModal && (
        <ExportICSModal
          items={items || []}
          onClose={() => setShowICSModal(false)}
          isSignedIn={isSignedIn}
        />
      )}

      {/* Sync JSON modal */}
      {syncJson !== null && (
        <div className={styles.modalOverlay} onClick={() => setSyncJson(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Sync Snapshot</span>
              <button className={styles.modalClose} onClick={() => setSyncJson(null)}>✕</button>
            </div>
            <pre className={styles.jsonPre}>{syncJson}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
