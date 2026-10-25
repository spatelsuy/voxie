import Head from "next/head";
import { useState, useEffect } from "react";
import { PRIVACY_VERSION } from "../lib/privacyVersion";
import { loadConsent, saveConsent } from "../lib/consentStore";
import styles from "../styles/privacyPage.module.css";

const PRIVACY_SECTIONS = [
  {
    title: "What we collect",
    body: "When you record or type, your audio and text are sent to our AI service for transcription and task extraction. We also store your verified email address (as a hash) to secure your profile and enable cloud sync. No passwords are ever created or stored.",
  },
  {
    title: "Voice recordings",
    body: "Your voice recording is never stored on Kahija's servers. It exists only in your browser while you record, is sent to Whisper solely to produce a transcript, and is then discarded. The audio never touches our database.",
  },
  {
    title: "AI processing (Whisper + free-tier LLM)",
    body: "Two external AI services receive your data: Whisper receives your audio to transcribe it; a free-tier large language model receives the transcript or typed text to extract tasks and summaries. Because we use the free tier, we do not have a formal data-processing agreement with the AI provider and cannot guarantee how they handle inputs on their side. Do not record sensitive personal, financial or medical information.",
  },
  {
    title: "Cloud storage & encryption",
    body: "When you use cloud sync, your data is encrypted in your browser using AES-256-GCM before it leaves your device. The encryption key never reaches our servers — only you hold it via your downloaded Kahija_Key.txt. The server stores only the opaque ciphertext and is technically unable to read your data.",
  },
  {
    title: "Email & one-time codes",
    body: "Your email is used only to verify your identity and link your encryption key. One-time codes are single-use, expire in 5 minutes, and are deleted immediately after use. We do not send marketing email.",
  },
  {
    title: "Email verification is optional",
    body: "You can use Kahija to record, transcribe and manage tasks without signing in. Email verification is only required if you want to sync your data across multiple devices.",
  },
  {
    title: "Your rights",
    body: "You can clear your cloud data or all local data at any time from the Profile page. Clearing cloud data permanently removes your synced copy from our servers. Deleting local data removes everything from this device. Neither action affects the other.",
  },
  {
    title: "Safety",
    body: "Do not use Kahija while driving, cycling, or operating machinery. Always comply with local laws regarding the use of recording devices and hands-free technology. Kahija is not responsible for any harm arising from use of the app while driving or in any unsafe situation.",
  },
];

const SECURITY_SECTIONS = [
  {
    title: "Voice recordings — never stored",
    body: "Your voice recording exists only in your browser's memory while you are recording. It is never written to our database or stored on any Kahija server. Once sent to Whisper for transcription, the audio is discarded. Only the resulting text is kept.",
  },
  {
    title: "AI services — what leaves your device",
    body: "Two external AI services receive your data: (1) Whisper receives your audio to produce a transcript. (2) A free-tier large language model receives the transcript or typed text to extract tasks and summaries. We do not have a data-processing agreement with the AI provider on the free tier. Do not record sensitive personal, financial or medical information.",
  },
  {
    title: "Your encryption key",
    body: "Kahija generates a 256-bit random AES key entirely inside your browser using the Web Crypto API (crypto.subtle). This uses your operating system's hardware random number generator. The raw key never leaves your browser. Only its SHA-256 fingerprint is ever sent to the server.",
  },
  {
    title: "Cloud encryption (AES-256-GCM)",
    body: "Before any data is sent to the cloud, it is encrypted in your browser. Each encryption uses a fresh random IV so the ciphertext is unique every time. The server stores only the encrypted blob and is technically unable to read your data.",
  },
  {
    title: "Profile seal (HMAC-SHA-256)",
    body: "When your email is verified, the server creates a tamper-proof HMAC-SHA-256 seal binding your email to your key fingerprint. Any future sync request must present this seal. If the email or key fingerprint has been changed, the seal fails and the request is rejected.",
  },
  {
    title: "OTP & email — hashed, never plain-text",
    body: "One-time codes and emails are stored only as SHA-256 hashes in the database. The raw values are never written. Codes expire after 5 minutes and are deleted immediately after use. After 5 wrong attempts the code is invalidated.",
  },
  {
    title: "What happens if the database is breached",
    body: "An attacker who steals the database gets: hashed emails (cannot be reversed without a dictionary attack), key fingerprints (cannot be reversed — the input is random), and encrypted blobs (cannot be decrypted without the AES key that only you hold).",
  },
];

export default function PrivacyPage() {
  const [securityExpanded, setSecurityExpanded] = useState(false);
  const [alreadyAccepted,  setAlreadyAccepted]  = useState(false);
  const [checked,          setChecked]          = useState(false);
  const [busy,             setBusy]             = useState(false);
  const [error,            setError]            = useState("");
  const [done,             setDone]             = useState(false);

  useEffect(() => {
    loadConsent().then((c) => {
      if (c?.version === PRIVACY_VERSION) {
        setAlreadyAccepted(true);
        setDone(true);
      }
    }).catch(() => {});
  }, []);

  async function handleAccept() {
    if (!checked) { setError("Please tick the checkbox to continue."); return; }
    setBusy(true); setError("");
    try {
      const { version, acceptedAt } = await saveConsent(PRIVACY_VERSION);

      // Best-effort cloud save for verified users
      try {
        const { loadProfile, keyFingerprint } = await import("../lib/profileStore");
        const saved = await loadProfile();
        if (saved.email && saved.cryptoKey && saved.seal) {
          const keyHash = await keyFingerprint(saved.cryptoKey);
          await fetch("/api/profile/consent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: saved.email,
              termsVersion: version,
              acceptedAt,
              seal: saved.seal,
              keyHash,
            }),
          });
        }
      } catch { /* non-fatal */ }

      setAlreadyAccepted(true);
      setDone(true);
    } catch (err) {
      setError("Could not save your acceptance. Please try again.");
      console.error("Privacy accept failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Privacy Policy and Data Security — Kahija</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className={styles.page}>
        <div className={styles.inner}>

          {/* Header */}
          <div className={styles.header}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/K_Logo.png" alt="Kahija" className={styles.logo} />
            <div>
              <div className={styles.title}>Privacy Policy and Data Security</div>
              <div className={styles.version}>Version {PRIVACY_VERSION}</div>
            </div>
            <button className={styles.backBtn} onClick={() => window.close()}>✕</button>
          </div>

          {/* Intro */}
          <p className={styles.intro}>
            This policy explains what data Kahija collects, how it is used, and how it is protected.
          </p>

          {/* Privacy sections */}
          <div className={styles.groupLabel}>Privacy Policy</div>
          {PRIVACY_SECTIONS.map((s) => (
            <div key={s.title} className={styles.section}>
              <div className={styles.sectionTitle}>{s.title}</div>
              <div className={styles.sectionBody}>{s.body}</div>
            </div>
          ))}

          {/* Data Security — collapsible */}
          <button
            className={styles.collapseToggle}
            onClick={() => setSecurityExpanded((v) => !v)}
          >
            <span>How Data Security Works</span>
            <span className={styles.chevron}>{securityExpanded ? "▲" : "▼"}</span>
          </button>

          {securityExpanded && SECURITY_SECTIONS.map((s) => (
            <div key={s.title} className={styles.section}>
              <div className={styles.sectionTitle}>{s.title}</div>
              <div className={styles.sectionBody}>{s.body}</div>
            </div>
          ))}

          {/* Accept footer */}
          <div className={styles.footer}>
            {done ? (
              <div className={styles.accepted}>
                ✓ You have accepted this policy (version {PRIVACY_VERSION}).
                {!alreadyAccepted && " You can close this page and continue."}
              </div>
            ) : (
              <>
                {error && <div className={styles.errorMsg}>{error}</div>}
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={checked}
                    onChange={(e) => { setChecked(e.target.checked); setError(""); }}
                  />
                  <span className={styles.checkLabel}>
                    I have read and accept the Privacy Policy, including how my data is handled by third-party AI services (version {PRIVACY_VERSION}).
                  </span>
                </label>
                <button
                  className={styles.acceptBtn}
                  onClick={handleAccept}
                  disabled={!checked || busy}
                >
                  {busy ? "Saving…" : "Accept & Continue"}
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
