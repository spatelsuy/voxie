import { useState, useEffect } from "react";
import styles from "../styles/profile.module.css";
import {
  loadProfile, generateProfileKey, saveProfile, keyFingerprint, checkProfileIntegrity,
  buildKeyFile, prepareRestore, exportKeyBase64, encryptJson, decryptJson,
} from "../lib/profileStore";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function postJson(url, body) {
  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function Profile({ onGetSyncData, onMergeSync, onClearLocalDB, hasConsent }) {
  const [step,     setStep]     = useState("loading"); // loading | email | otp | done | tampered
  const [legacyKey, setLegacyKey] = useState(null);    // pre-seal key found in the DB, kept (not regenerated) on re-verify
  const [unverifiedNote, setUnverifiedNote] = useState(false); // integrity could not be checked (offline)
  const [restoring, setRestoring] = useState(null);   // { email, cryptoKey, seal, from } — file passed the seal check, awaiting OTP
  const [email,    setEmail]    = useState("");
  const [otp,      setOtp]      = useState("");
  const [keyB64,   setKeyB64]   = useState("");
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [info,     setInfo]     = useState("");
  const [syncState,  setSyncState]  = useState(null); // null | "syncing" | "done" | "error"
  const [syncMsg,    setSyncMsg]    = useState("");
  const [cloudClear, setCloudClear] = useState(null); // null | "confirm" | "clearing" | "done" | "error"
  const [cloudMsg,   setCloudMsg]   = useState("");
  const [localClear, setLocalClear] = useState(null); // null | "confirm" | "clearing" | "done" | "error"
  const [showSignInInfo,  setShowSignInInfo]  = useState(false);
  const [showKeyInfo,     setShowKeyInfo]     = useState(false);

  /* Restore an already-verified profile from the browser DB */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await loadProfile();
        if (!mounted) return;
        if (saved.email && saved.cryptoKey) {
          const integrity = await checkProfileIntegrity(saved.email, saved.cryptoKey, saved.seal);
          if (!mounted) return;
          if (integrity === "invalid") {
            setStep("tampered");          // email, key or seal was changed
          } else if (integrity === "unsealed") {
            // Created before sealing existed: keep the same key, re-verify the email to seal it
            setLegacyKey(saved.cryptoKey);
            setEmail(saved.email);
            setInfo("Please verify your email again to secure your existing key.");
            setStep("email");
          } else {
            setEmail(saved.email);
            setUnverifiedNote(integrity === "unreachable");
            setStep("done");              // never display the key again
          }
        } else {
          setInfo("Create your profile and enable cloud sync.");
          setStep("email");
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
        if (mounted) {
          setInfo("Create your profile and enable cloud sync.");
          setStep("email");
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* keyHash is sent when the same key is coming back (restore / legacy re-verify), so the server
     can tell it apart from a request to create a second key for an already-registered email. */
  async function sendOtpTo(clean, cryptoKey) {
    await postJson("/api/otp/send", { email: clean, ...(cryptoKey && { keyHash: await keyFingerprint(cryptoKey) }) });
    setEmail(clean);
    setOtp("");
    setStep("otp");
    setInfo(`We sent a 6-digit code to ${clean}. It is valid for 5 minutes.`);
  }

  async function handleSendOtp() {
    setError(""); setInfo("");
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) { setError("Enter a valid email address."); return; }
    setBusy(true);
    try {
      await sendOtpTo(clean, restoring?.cryptoKey || legacyKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setError(""); setInfo("");
    if (!/^\d{6}$/.test(otp)) { setError("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      if (restoring) {
        // Restore: the server re-checks the file's seal AND the OTP; only then is the DB written
        await postJson("/api/otp/verify", {
          email: restoring.email,
          otp,
          keyHash: await keyFingerprint(restoring.cryptoKey),
          restoreSeal: restoring.seal,
        });
        await saveProfile(restoring.email, restoring.cryptoKey, restoring.seal);
        setEmail(restoring.email);
        setRestoring(null);
        setKeyB64("");               // restored keys are not displayed
        setLegacyKey(null);
        setUnverifiedNote(false);
        setStep("done");
        return;
      }
      const cryptoKey = legacyKey || await generateProfileKey();
      const { seal } = await postJson("/api/otp/verify", { email, otp, keyHash: await keyFingerprint(cryptoKey) });
      await saveProfile(email, cryptoKey, seal);
      setLegacyKey(null);
      setKeyB64(await exportKeyBase64(cryptoKey));
      setStep("done");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /* Leave the OTP step. While restoring, go back to where the upload started (never to "new key"). */
  function handleCancelOtp() {
    setError(""); setInfo(""); setOtp("");
    if (restoring) {
      setStep(restoring.from);
      setRestoring(null);
    } else {
      setStep("email");
    }
  }

  /* Recovery: upload Kahija_Key.txt -> seal checked first (tampered file = error) -> OTP to the
     file's email -> only then is the browser DB rebuilt. */
  async function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(""); setInfo("");
    setBusy(true);
    try {
      if (file.size > 10 * 1024) throw new Error("This is not a valid Kahija key file.");
      const prepared = await prepareRestore(await file.text()); // throws if modified / not genuine
      setRestoring({ ...prepared, from: step });
      try {
        await sendOtpTo(prepared.email, prepared.cryptoKey);
      } catch (err) {
        setRestoring(null);
        throw err;
      }
    } catch (err) {
      setError(err.message || "Could not restore from this file.");
    } finally {
      setBusy(false);
    }
  }

  /* Always reads the key from the browser DB, so it can be downloaded any time,
     even when it is not displayed on screen. */
  async function handleDownloadKey() {
    setError("");
    try {
      const saved = await loadProfile();
      if (!saved.cryptoKey || !saved.email) throw new Error("No key found in this browser.");
      // Never hand out a key that fails its integrity check
      const integrity = await checkProfileIntegrity(saved.email, saved.cryptoKey, saved.seal);
      if (integrity === "invalid") { setStep("tampered"); return; }
      if (integrity !== "valid") throw new Error("Could not verify your key right now. Check your connection and try again.");
      const b64  = await exportKeyBase64(saved.cryptoKey);
      const text = buildKeyFile(saved.email, b64, saved.seal);
      const url  = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const a    = document.createElement("a");
      a.href = url;
      a.download = "Kahija_Key.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setKeyB64(""); // hide the key on screen once it has been downloaded
    } catch (err) {
      console.error("Key download failed:", err);
      setError(err.message || "Could not download the key.");
    }
  }

  /* ── Cloud sync (Supabase). Data is encrypted in the browser with the Kahija key; the server
        stores it under the verified email and only checks the profile's seal. ── */
  async function cloudCall(action, payload) {
    const saved = await loadProfile();
    if (!saved.email || !saved.cryptoKey || !saved.seal) throw new Error("Verify your email first.");
    const data = await postJson("/api/profile/sync", {
      action, email: saved.email, keyHash: await keyFingerprint(saved.cryptoKey), seal: saved.seal, payload,
    });
    return { data, cryptoKey: saved.cryptoKey };
  }

  function flash(setState, setMsg, state, msg, ms = 4000) {
    setState(state); setMsg(msg);
    setTimeout(() => { setState(null); setMsg(""); }, ms);
  }

  async function handleSync() {
    setSyncState("syncing"); setSyncMsg("Checking cloud…");
    try {
      // 1. Pull and merge what is already in the cloud. If it can't be decrypted we stop,
      //    so an upload can never overwrite data we couldn't read.
      const { data: got, cryptoKey } = await cloudCall("get");
      let pulled = 0;
      if (got.payload) {
        pulled = (await onMergeSync(await decryptJson(cryptoKey, got.payload)))?.itemsUpdated || 0;
      }
      // 2. Upload the merged local snapshot
      setSyncMsg("Uploading…");
      const snapshot = await onGetSyncData();
      if (!snapshot) throw new Error("Local data is not ready yet. Try again in a moment.");
      await cloudCall("put", await encryptJson(cryptoKey, snapshot));
      flash(setSyncState, setSyncMsg, "done",
        pulled > 0 ? `Synced ✓ — ${pulled} item${pulled !== 1 ? "s" : ""} pulled` : "Synced ✓ — up to date");
    } catch (err) {
      console.error("Sync failed:", err);
      flash(setSyncState, setSyncMsg, "error", `Sync failed: ${err.message}`, 5000);
    }
  }

  async function handleClearCloud() {
    if (cloudClear === null) { setCloudClear("confirm"); return; }
    if (cloudClear !== "confirm") return;
    setCloudClear("clearing");
    try {
      await cloudCall("delete");
      flash(setCloudClear, setCloudMsg, "done", "Cloud data cleared ✓");
    } catch (err) {
      console.error("Clear cloud failed:", err);
      flash(setCloudClear, setCloudMsg, "error", `Error: ${err.message}`, 5000);
    }
  }

  async function handleClearLocal() {
    if (localClear === null) { setLocalClear("confirm"); return; }
    if (localClear !== "confirm") return;
    setLocalClear("clearing");
    try {
      await onClearLocalDB();
      flash(setLocalClear, () => {}, "done", "", 3000);
    } catch (err) {
      console.error("Clear local DB failed:", err);
      flash(setLocalClear, () => {}, "error", "", 4000);
    }
  }

  const verified = step === "done";

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>Profile</div>
          <div className={styles.sub}>Verify your email and secure your data</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/K_Logo.png" alt="Kahija" className={styles.headerLogo} />
      </div>

      <div className={styles.body}>
        <div className={styles.card}>
          {step === "loading" && <div className={styles.cardText}>Loading…</div>}

          {step === "email" && (
            <>
              <div className={styles.signInRow}>
                <span className={styles.signInLabel}>SIGN IN</span>
                <button
                  className={styles.signInInfoBtn}
                  onClick={() => setShowSignInInfo((v) => !v)}
                  aria-label="About sign in"
                >
                  ⓘ
                </button>
                {!hasConsent && (
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.consentNudge}>
                    Accept Privacy Policy
                  </a>
                )}
              </div>
              {showSignInInfo && (
                <div className={styles.signInInfo}>
                  Create your profile and enable cloud sync. Sign in is only required if you want to sync your data across multiple devices. Once signed in, Kahija keeps your recordings, transcripts and activities in sync — whether you&apos;re at your desk or on the go.
                </div>
              )}
              <input
                type="email"
                className={styles.textInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && handleSendOtp()}
                placeholder="you@example.com"
                autoComplete="email"
                aria-label="Email address"
              />
              <button className={styles.primaryBtn} onClick={handleSendOtp} disabled={busy}>
                {busy ? "Sending…" : "Send code"}
              </button>

              <div className={styles.signInRow} style={{ marginTop: 20 }}>
                <span className={styles.signInLabel}>ALREADY HAVE A KEY?</span>
                <button
                  className={styles.signInInfoBtn}
                  onClick={() => setShowKeyInfo((v) => !v)}
                  aria-label="About restoring from key"
                >
                  ⓘ
                </button>
              </div>
              {showKeyInfo && (
                <div className={styles.signInInfo}>
                  Restore your profile by uploading the Kahija_Key.txt you downloaded earlier. We will email a code to confirm it is you.
                </div>
              )}
              <label className={`${styles.secondaryBtn} ${busy ? styles.secondaryBtnDisabled : ""}`}>
                Upload Kahija_Key.txt
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleRestoreFile}
                  disabled={busy}
                  style={{ display: "none" }}
                />
              </label>
            </>
          )}

          {step === "tampered" && (
            <>
              <div className={styles.cardTitle}>Profile integrity check failed</div>
              <div className={styles.keyWarning}>
                The email or key stored in this browser does not match its security seal. It may have been
                modified, so it has been blocked and will not be used or downloaded.
              </div>
              <div className={styles.cardText}>
                To recover, upload your original Kahija_Key.txt. We will email a code to confirm it is you,
                and it will then replace the stored profile.
              </div>
              <label className={`${styles.secondaryBtn} ${busy ? styles.secondaryBtnDisabled : ""}`}>
                Upload Kahija_Key.txt
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={handleRestoreFile}
                  disabled={busy}
                  style={{ display: "none" }}
                />
              </label>
            </>
          )}

          {step === "otp" && (
            <>
              <div className={styles.cardTitle}>{restoring ? "Confirm it's you" : "Enter the code"}</div>
              {restoring && (
                <div className={styles.cardText}>Your key file is genuine. Enter the code to restore your profile.</div>
              )}
              {info && <div className={styles.cardText}>{info}</div>}
              <div className={styles.backendNote}>
                Can&apos;t find the email? Check your spam or junk folder.
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                className={`${styles.textInput} ${styles.otpInput}`}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && !busy && handleVerify()}
                placeholder="000000"
                autoComplete="one-time-code"
                aria-label="6-digit code"
                autoFocus
              />
              <button className={styles.primaryBtn} onClick={handleVerify} disabled={busy}>
                {busy ? "Verifying…" : "Verify"}
              </button>
              <div className={styles.linkRow}>
                <button type="button" className={styles.linkBtn} onClick={handleSendOtp} disabled={busy}>
                  Resend code
                </button>
                <button type="button" className={styles.linkBtn} onClick={handleCancelOtp} disabled={busy}>
                  {restoring ? "Cancel" : "Change email"}
                </button>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <div className={styles.cardTitle}>
                <span className={styles.verified}>Verified</span>{' '}
                (<span className={styles.cardText}>{email}</span>) ✓
              </div>
              {unverifiedNote && (
                <div className={styles.backendNote}>
                  Could not re-check your profile&apos;s integrity (offline?). Downloads are disabled until it can be checked.
                </div>
              )}

              <div className={styles.sectionLabel} style={{ marginTop: 16 }}>Your encryption key</div>
              {keyB64 ? (
                <div className={styles.keyBox}>{keyB64}</div>
              ) : (
                <div className={styles.cardText}>
                  Your key is stored securely in this browser and is not displayed.
                </div>
              )}
              <button className={styles.primaryBtn} onClick={handleDownloadKey}>
                Download Kahija_Key.txt
              </button>
              <div className={styles.keyWarning}>
                Keep this key safe and secure. If you lose it, your data cannot be recovered.
              </div>
            </>
          )}

          {error && <div className={styles.errorMsg} role="alert">{error}</div>}
        </div>

        {step !== "loading" && (
          <div className={styles.card} style={{ marginTop: 12 }}>
            <div className={styles.cardText} style={{ marginTop: 0 }}>
              {verified
                ? <><strong>CLOUD SYNC:</strong> Your activities and transcripts are encrypted with your Kahija key before they leave this device.</>
                : <><strong>CLOUD SYNC:</strong> Verify your email to turn on cloud sync.</>}
            </div>
            <div className={styles.btnRow}>
              <button
                className={`${styles.syncBtn} ${
                  syncState === "done" ? styles.syncBtnDone : syncState === "error" ? styles.syncBtnError : ""
                }`}
                onClick={handleSync}
                disabled={!verified || syncState === "syncing"}
              >
                {syncState ? syncMsg : "Sync to Kahija DB"}
              </button>
              <button
                className={`${styles.clearCloudBtn} ${
                  cloudClear === "confirm" ? styles.clearBtnConfirm :
                  cloudClear === "done"    ? styles.clearBtnDone    :
                  cloudClear === "error"   ? styles.clearBtnError   : ""
                }`}
                onClick={handleClearCloud}
                disabled={!verified || cloudClear === "clearing" || cloudClear === "done"}
              >
                {cloudClear === "confirm"  ? "Tap again to confirm" :
                 cloudClear === "clearing" ? "Clearing…" :
                 cloudClear                ? cloudMsg :
                 "Clear Cloud Data"}
              </button>
            </div>
            {cloudClear === "confirm" && (
              <div className={styles.backendNote} style={{ color: "#c2410c" }}>
                This permanently deletes your synced copy from Kahija DB. Data on this device is not affected.
              </div>
            )}

            <div className={styles.sectionLabel} style={{ marginTop: 20 }}>
              Local storage
              <span className={styles.infoWrap}>
                <span className={styles.infoIcon}>ⓘ</span>
                <span className={styles.infoTooltip}>
                  Removes all recordings, transcripts and activities stored on this device. Your settings and key are kept. This does not affect your cloud copy.
                </span>
              </span>
            </div>
            <button
              className={`${styles.clearLocalBtn} ${
                localClear === "confirm" ? styles.clearBtnConfirm :
                localClear === "done"    ? styles.clearBtnDone    :
                localClear === "error"   ? styles.clearBtnError   : ""
              }`}
              onClick={handleClearLocal}
              disabled={localClear === "clearing" || localClear === "done"}
            >
              {localClear === "confirm"  ? "Tap again to confirm — this cannot be undone" :
               localClear === "clearing" ? "Clearing…" :
               localClear === "done"     ? "Local data cleared ✓" :
               localClear === "error"    ? "Failed — try again" :
               "Clear Local Data"}
            </button>
            {localClear === "confirm" && (
              <div className={styles.backendNote} style={{ color: "#c2410c" }}>
                Tap the button above again to confirm. Or navigate away to cancel.
              </div>
            )}
          </div>
        )}

        {/* ── Info links ── */}
        <div className={styles.card} style={{ marginTop: 12 }}>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.infoLinkRow}>
            <span className={styles.infoLinkIcon}>🔒</span>
            <span className={styles.infoLinkLabel}>Privacy Policy and Data Security</span>
            <span className={styles.infoLinkChevron}>›</span>
          </a>
        </div>

      </div>

    </div>
  );
}
