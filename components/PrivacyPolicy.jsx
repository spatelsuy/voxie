import { useState } from "react";
import { PRIVACY_VERSION } from "../lib/privacyVersion";
import styles from "../styles/infoPanel.module.css";

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
    body: "Two external AI services receive your data: Whisper receives your audio to transcribe it; a free-tier large language model receives the transcript or typed text to extract tasks and summaries. Because we use the free tier, we do not have a formal data-processing agreement with the AI provider and cannot guarantee how they handle inputs. Do not record sensitive personal, financial or medical information.",
  },
  {
    title: "Cloud storage & encryption",
    body: "When you use cloud sync, your data is encrypted in your browser using AES-256-GCM before it leaves your device. The encryption key never reaches our servers — only you hold it (via your downloaded Kahija_Key.txt). The server stores only the opaque ciphertext. We are technically unable to read your synced data.",
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

/**
 * @param {{ onClose: () => void, readOnly?: boolean }} props
 * readOnly=true  → shown from Profile page, no checkbox (already accepted)
 * readOnly=false → (not used directly — ConsentGate handles first-time acceptance)
 */
export default function PrivacyPolicy({ onClose, readOnly = false }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>

        <div className={styles.header}>
          <div className={styles.title}>Privacy Policy</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.scroll}>
          <p className={styles.intro}>
            Version <strong>{PRIVACY_VERSION}</strong> — this policy explains what data Kahija collects, how it is used, and how it is protected.
          </p>

          {PRIVACY_SECTIONS.map((s) => (
            <div key={s.title} className={styles.section}>
              <div className={styles.sectionTitle}>{s.title}</div>
              <div className={styles.sectionBody}>{s.body}</div>
            </div>
          ))}

          {/* Collapsible Data Security */}
          <button
            className={styles.collapseToggle}
            onClick={() => setExpanded((v) => !v)}
          >
            <span>How Data Security Works</span>
            <span className={styles.collapseChevron}>{expanded ? "▲" : "▼"}</span>
          </button>

          {expanded && (
            <div>
              {SECURITY_SECTIONS.map((s) => (
                <div key={s.title} className={styles.section}>
                  <div className={styles.sectionTitle}>{s.title}</div>
                  <div className={styles.sectionBody}>{s.body}</div>
                </div>
              ))}
            </div>
          )}

          {readOnly && (
            <p className={styles.readOnlyNote}>
              You accepted this policy (version {PRIVACY_VERSION}). If the policy changes, you will be asked to accept again.
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
