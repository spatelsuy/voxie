import { useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import styles from "../styles/profile.module.css";

export default function Profile({ onGetSyncData, onMergeSync }) {
  const { data: session, status } = useSession();
  const isSignedIn = status === "authenticated";

  const [syncJson,    setSyncJson]    = useState(null);
  const [jsonLoading, setJsonLoading] = useState(false);
  const [syncState,   setSyncState]   = useState(null); // null | "uploading" | "downloading" | "done" | "error"
  const [syncMsg,     setSyncMsg]     = useState("");

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

  /* ── Sync to Drive (upload then download-merge) ───── */
  async function handleSync() {
    if (!isSignedIn) return;
    setSyncState("uploading");
    setSyncMsg("Uploading to Drive…");
    try {
      // 1. Build local snapshot and upload
      const snapshot = await onGetSyncData();
      const uploadRes = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${uploadRes.status})`);
      }

      // 2. Download the just-written file back and merge
      setSyncState("downloading");
      setSyncMsg("Merging from Drive…");
      const dlRes = await fetch("/api/sync");
      if (dlRes.status === 404) {
        // Nothing on Drive yet — upload was first write, we're done
        setSyncState("done");
        setSyncMsg("Synced ✓ (first upload)");
        setTimeout(() => { setSyncState(null); setSyncMsg(""); }, 3000);
        return;
      }
      if (!dlRes.ok) {
        const err = await dlRes.json().catch(() => ({}));
        throw new Error(err.error || `Download failed (${dlRes.status})`);
      }
      const remote = await dlRes.json();
      const { itemsUpdated } = await onMergeSync(remote);

      setSyncState("done");
      setSyncMsg(`Synced ✓ — ${itemsUpdated} item${itemsUpdated !== 1 ? "s" : ""} updated`);
      setTimeout(() => { setSyncState(null); setSyncMsg(""); }, 4000);
    } catch (err) {
      console.error("Sync failed:", err);
      setSyncState("error");
      setSyncMsg(`Sync failed: ${err.message}`);
      setTimeout(() => { setSyncState(null); setSyncMsg(""); }, 5000);
    }
  }

  const syncBusy = syncState === "uploading" || syncState === "downloading";

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Profile</div>
        <div className={styles.sub}>Sign in to sync and personalize your experience</div>
      </div>

      <div className={styles.body}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>{isSignedIn ? "Signed in" : "Login options"}</div>
          <div className={styles.cardText}>
            {isSignedIn
              ? `Signed in as ${session.user?.email || session.user?.name || "Google user"}.`
              : "Connect your account to continue with Kahija across devices."}
          </div>

          {isSignedIn ? (
            <button className={styles.googleBtn} onClick={() => signOut()}>
              Sign out
            </button>
          ) : (
            <button className={styles.googleBtn} onClick={() => signIn("google")}>
              Continue with Google
            </button>
          )}

          {/* Sync button — only when signed in */}
          {isSignedIn && (
            <button
              className={`${styles.syncBtn} ${
                syncState === "done"  ? styles.syncBtnDone  :
                syncState === "error" ? styles.syncBtnError : ""
              }`}
              onClick={handleSync}
              disabled={syncBusy}
            >
              {syncBusy ? syncMsg : syncState === "done" ? syncMsg : syncState === "error" ? syncMsg : "Sync to Drive"}
            </button>
          )}

          <button
            className={styles.syncJsonBtn}
            onClick={handleViewSync}
            disabled={jsonLoading}
          >
            {jsonLoading ? "Loading…" : "View Sync JSON"}
          </button>
        </div>
      </div>

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
