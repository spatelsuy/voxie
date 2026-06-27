import { useEffect, useState } from "react";
import styles from "../styles/settings.module.css";

export default function Settings({ dbWarning, recordingsCount, settings, onSettingChange }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(settings.userName);

  const totalMB = dbWarning?.text?.match(/([\d.]+\s*(MB|KB))/)?.[0] ?? "—";

  useEffect(() => {
    setNameInput(settings.userName);
  }, [settings.userName]);

  function saveName() {
    onSettingChange("userName", nameInput.trim() || "SunilK");
    setEditingName(false);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Settings</div>
      </div>

      <div className={styles.scroll}>

        {/* Recording */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>Recording</div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>🔇</span>
            <span className={styles.rowLabel}>Auto-pause on silence</span>
            <button
              className={`${styles.toggle} ${settings.autoPause ? styles.toggleOn : ""}`}
              onClick={() => onSettingChange("autoPause", !settings.autoPause)}
              aria-label="Toggle auto-pause"
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>⏱</span>
            <span className={styles.rowLabel}>Silence timeout</span>
            <div className={styles.stepper}>
              <button className={styles.stepBtn} onClick={() => onSettingChange("silenceSec", Math.max(5, settings.silenceSec - 5))}>−</button>
              <span className={styles.stepVal}>{settings.silenceSec}s</span>
              <button className={styles.stepBtn} onClick={() => onSettingChange("silenceSec", Math.min(120, settings.silenceSec + 5))}>+</button>
            </div>
          </div>
        </div>

        {/* AI / A2T */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>AI / A2T</div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>🤖</span>
            <span className={styles.rowLabel}>Auto-run A2T after stop</span>
            <button
              className={`${styles.toggle} ${settings.autoA2T ? styles.toggleOn : ""}`}
              onClick={() => onSettingChange("autoA2T", !settings.autoA2T)}
              aria-label="Toggle auto A2T"
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>👤</span>
            <span className={styles.rowLabel}>User name</span>
            {editingName ? (
              <div className={styles.nameEdit}>
                <input
                  className={styles.nameInput}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  autoFocus
                />
                <button className={styles.nameSave} onClick={saveName}>Save</button>
              </div>
            ) : (
              <button className={styles.rowVal} onClick={() => { setNameInput(settings.userName); setEditingName(true); }}>
                {settings.userName} ›
              </button>
            )}
          </div>
        </div>

        {/* Tasks */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>Tasks</div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>✅</span>
            <span className={styles.rowLabel}>Show completed items</span>
            <button
              className={`${styles.toggle} ${settings.showCompletedItems ? styles.toggleOn : ""}`}
              onClick={() => onSettingChange("showCompletedItems", !settings.showCompletedItems)}
              aria-label="Toggle completed items"
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
        </div>

        {/* Storage */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>Storage</div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>🗄️</span>
            <span className={styles.rowLabel}>Recordings</span>
            <span className={styles.rowValMuted}>{recordingsCount} file{recordingsCount !== 1 ? "s" : ""}</span>
          </div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>📊</span>
            <span className={styles.rowLabel}>Space used</span>
            <span className={styles.rowValMuted}>{totalMB}</span>
          </div>
        </div>

        {/* About */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>About</div>
          <div className={styles.row}>
            <span className={styles.rowIcon}>ℹ️</span>
            <span className={styles.rowLabel}>My Organizer</span>
            <span className={styles.rowValMuted}>v1.0</span>
          </div>
        </div>

      </div>
    </div>
  );
}
