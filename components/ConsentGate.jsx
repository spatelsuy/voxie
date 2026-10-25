import { useState, useEffect, useRef } from "react";
import { PRIVACY_VERSION } from "../lib/privacyVersion";
import { loadConsent, saveConsent } from "../lib/consentStore";
import styles from "../styles/consentGate.module.css";

/* ── Data Security sections (embedded, collapsible) ─────── */
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
    body: "Kahija generates a 256-bit random AES key entirely inside your browser using the Web Crypto API. The raw key never leaves your browser. Only its SHA-256 fingerprint is ever sent to the server.",
  },
  {
    title: "Cloud encryption (AES-256-GCM)",
    body: "Before any data is sent to the cloud, it is encrypted in your browser. The server stores only the encrypted blob and is technically unable to read your data.",
  },
  {
    title: "Profile seal (HMAC-SHA-256)",
    body: "When your email is verified, the server creates a tamper-proof seal binding your email to your key fingerprint. Any future sync request must present this seal. If anything is changed, the seal fails and the request is rejected.",
  },
  {
    title: "OTP & email — hashed, never plain-text",
    body: "One-time codes and emails are stored only as SHA-256 hashes in the database. The raw values are never written. Codes expire after 5 minutes and are deleted immediately after use.",
  },
];

/* ── Privacy Policy sections ─────────────────────────────── */
const PRIVACY_SECTIONS = [
  {
    title: "What we collect",
    body: "When you record or type, your audio and text are sent to our AI service for transcription and task extraction. We also store your verified email address (as a hash) to secure your profile and enable cloud sync. No passwords are ever created or stored.",
  },
  {
    title: "Voice recordings",
    body: "Your voice recording is never stored on Kahija's servers. It exists only in your browser while you record, is sent to Whisper solely to produce a transcript, and is then discarded.",
  },
  {
    title: "AI processing (Whisper + free-tier LLM)",
    body: "Whisper receives your audio to transcribe it. A free-tier large language model receives the transcript or typed text to extract tasks. Because we use the free tier, we cannot guarantee how the AI provider handles inputs. Do not record sensitive personal, financial or medical information.",
  },
  {
    title: "Cloud storage & encryption",
    body: "Cloud sync data is encrypted with AES-256-GCM in your browser before it leaves your device. The encryption key never reaches our servers — only you hold it. We are technically unable to read your synced data.",
  },
  {
    title: "Email & one-time codes",
    body: "Your email is used only to verify your identity. One-time codes are single-use, expire in 5 minutes, and are deleted immediately after use. We do not send marketing email.",
  },
  {
    title: "Email verification is optional",
    body: "You can use Kahija to record, transcribe and manage tasks without signing in. Email verification is only required if you want to sync your data across multiple devices.",
  },
  {
    title: "Your rights",
    body: "You can clear your cloud data or all local data at any time from the Profile page. Clearing cloud data permanently removes your synced copy from our servers. Deleting local data removes everything from this device.",
  },
  {
    title: "Safety",
    body: "Do not use Kahija while driving, cycling, or operating machinery. Always comply with local laws regarding the use of recording devices and hands-free technology. Kahija is not responsible for any harm arising from use of the app while driving or in any unsafe situation.",
  },
];

export default function ConsentGate({ children }) {
  const [status,   setStatus]   = useState("loading"); // loading | required | accepted
  const [expanded, setExpanded] = useState(false);     // Data Security section expanded
  const [checked,  setChecked]  = useState(false);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    loadConsent().then((c) => {
      if (c?.version === PRIVACY_VERSION) {
        setStatus("accepted");
      } else {
        setStatus("required");
      }
    }).catch(() => setStatus("required"));
  }, []);

  async function handleAccept() {
    if (!checked) { setError("Please tick the checkbox to continue."); return; }
    setBusy(true); setError("");
    try {
      const { version, acceptedAt } = await saveConsent(PRIVACY_VERSION);

      // Best-effort cloud save — only possible if the user has a verified profile.
      // We fire-and-forget; failure is non-fatal (local consent is already stored).
      try {
        const { loadProfile } = await import("../lib/profileStore");
        const { keyFingerprint } = await import("../lib/profileStore");
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
      } catch {
        // Silently ignore — local consent already saved
      }

      setStatus("accepted");
    } catch (err) {
      setError("Could not save your acceptance. Please try again.");
      console.error("ConsentGate save failed:", err);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  if (status === "accepted") return children;

  const isUpdate = false; // could check if a previous version existed

  return (
    <div className={styles.overlay}>
      <div className={styles.sheet}>

        {/* Header */}
        <div className={styles.header}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/K_Logo.png" alt="Kahija" className={styles.logo} />
          <div className={styles.headerText}>
            <div className={styles.title}>
              {isUpdate ? "Our Privacy Policy has changed" : "Before you start"}
            </div>
            <div className={styles.sub}>Please read and accept to continue</div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className={styles.scroll} ref={scrollRef}>

          <div className={styles.versionBadge}>Version {PRIVACY_VERSION}</div>

          {/* Privacy Policy sections */}
          <div className={styles.sectionGroup}>Privacy Policy</div>
          {PRIVACY_SECTIONS.map((s) => (
            <div key={s.title} className={styles.section}>
              <div className={styles.sectionTitle}>{s.title}</div>
              <div className={styles.sectionBody}>{s.body}</div>
            </div>
          ))}

          {/* Data Security — collapsible */}
          <button
            className={styles.collapseToggle}
            onClick={() => setExpanded((v) => !v)}
          >
            <span>How Data Security Works</span>
            <span className={styles.collapseChevron}>{expanded ? "▲" : "▼"}</span>
          </button>

          {expanded && (
            <div className={styles.collapsedContent}>
              {SECURITY_SECTIONS.map((s) => (
                <div key={s.title} className={styles.section}>
                  <div className={styles.sectionTitle}>{s.title}</div>
                  <div className={styles.sectionBody}>{s.body}</div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer: checkbox + accept button */}
        <div className={styles.footer}>
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
        </div>

      </div>
    </div>
  );
}
