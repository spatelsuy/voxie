import styles from "../styles/infoPanel.module.css";

const SECTIONS = [
  {
    title: "Voice recordings — never stored",
    body: "Your voice recording exists only in your browser's memory while you are recording. It is never written to our database or stored on any Kahija server. Once the recording is sent to the Whisper AI service for transcription, the audio is discarded. Only the resulting text (the transcript) is kept — in your browser's local storage and, if you sync, as an encrypted blob in the cloud.",
  },
  {
    title: "AI services — what leaves your device and who sees it",
    body: "Two pieces of data are sent to external AI services:\n\n1. AUDIO → Whisper (speech-to-text): your voice recording is sent to the Whisper AI service to produce a transcript. Whisper receives the raw audio.\n\n2. TRANSCRIPT / TEXT → a large language model (currently a free-tier AI): the transcript or text you typed is sent to extract tasks, dates and summaries. The free tier means we do not have a data-processing agreement with the AI provider, so we cannot guarantee how they handle inputs on their side. Do not record sensitive personal, financial or medical information.",
  },
  {
    title: "Your encryption key",
    body: "When you first verify your email, Kahija generates a 256-bit random encryption key entirely inside your browser using the Web Crypto API (crypto.subtle). This uses your operating system's hardware random number generator — the most secure source of randomness available. The raw key never leaves your browser.",
  },
  {
    title: "How cloud data is encrypted",
    body: "Before any data is sent to the cloud, it is encrypted in your browser using AES-256-GCM — the same standard used by banks and governments. Each encryption uses a fresh random 12-byte IV (initialisation vector), so even if you upload the same data twice, the ciphertext looks completely different each time. The server only ever receives the encrypted blob.",
  },
  {
    title: "Key fingerprint — what the server sees",
    body: "The server never receives your encryption key. Instead, the browser computes SHA-256(key bytes) — a 64-character fingerprint — and sends only that. SHA-256 is a one-way function: given the fingerprint, it is computationally impossible to recover the original key (the input is 256 bits of pure randomness — no dictionary or brute-force attack is feasible).",
  },
  {
    title: "The profile seal",
    body: "When your OTP is verified, the server creates a seal: HMAC-SHA-256(server_secret, email + key_fingerprint). This is a tamper-proof certificate that proves \"this email and this key were verified together on this server\". HMAC requires a secret key only the server holds, so the seal cannot be forged by anyone else. Any future sync request must present this seal — if the email or key fingerprint has been changed, the seal fails and the request is rejected.",
  },
  {
    title: "How the OTP is stored",
    body: "One-time codes are never stored in plain text. The database stores SHA-256(\"otp|email|code\") — a hash that combines the email and code together. Even if the database were stolen, an attacker cannot reverse the hash to learn the code. The code also expires after 5 minutes and is deleted immediately after first use. After 5 wrong attempts, the code is invalidated.",
  },
  {
    title: "How the email is stored",
    body: "Your raw email address is never written to the database. The server stores SHA-256(\"email|your@email.com\") as the primary key. The prefix \"email|\" is a domain-separation technique that ensures the hash cannot be confused with any other hashed value in the system.",
  },
  {
    title: "Kahija_Key.txt — your backup",
    body: "If you download your key file, it contains your email, the base64-encoded AES key, and the server seal. Guard this file carefully — it is the only way to restore your profile on a new device. Anyone who has this file and access to your email inbox can restore your profile. We recommend storing it in a password manager.",
  },
  {
    title: "What happens if the database is breached",
    body: "An attacker who steals the Supabase database gets: hashed emails (cannot be reversed to real addresses without a dictionary attack), key fingerprints (cannot be reversed to AES keys — the input is random), and encrypted blobs (cannot be decrypted without the AES key). Your actual recordings, transcripts and tasks remain safe.",
  },
  {
    title: "The one thing that must stay secret",
    body: "The server's KAHIJA_PROFILE_SECRET environment variable is the signing key for all profile seals. If it were stolen, an attacker could forge seals and access cloud sync slots — but they would still see only encrypted blobs they cannot decrypt. This secret lives only in the server environment and is never sent to any client or stored in the database.",
  },
];

export default function DataSecurity({ onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>How Data Security Works</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className={styles.scroll}>
          <p className={styles.intro}>
            A plain-language explanation of every security mechanism Kahija uses to protect your data.
          </p>

          {SECTIONS.map((s) => (
            <div key={s.title} className={styles.section}>
              <div className={styles.sectionTitle}>{s.title}</div>
              <div className={styles.sectionBody}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
