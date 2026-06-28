import ReactMarkdown from "react-markdown";
import onboardingContent from "../content/onboardingContent";
import styles from "../styles/onboarding.module.css";

export default function OnboardingPanel({ title = "How Voxie works", actionLabel = "Start recording", onAction, onClose, showClose = false }) {
  return (
    <div className={styles.panel}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.eyebrow}>{title}</div>
          <div className={styles.heading}>Talk instead of type</div>
        </div>
        {showClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close onboarding">
            ✕
          </button>
        )}
      </div>

      <div className={styles.content}>
        <ReactMarkdown>{onboardingContent}</ReactMarkdown>
      </div>

      <button className={styles.primaryBtn} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
