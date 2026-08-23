import { useEffect, useMemo, useState } from "react";
import styles from "../styles/settings.module.css";

const FONT_OPTIONS = [
  { value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif", label: "System default" },
  { value: "Arial, Helvetica, sans-serif",          label: "Arial" },
  { value: "'Courier New', Courier, monospace",     label: "Courier New" },
  { value: "Georgia, 'Times New Roman', serif",     label: "Georgia" },
  { value: "Helvetica, Arial, sans-serif",          label: "Helvetica" },
  { value: "Impact, Haettenschweiler, sans-serif",  label: "Impact" },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: "Trebuchet MS" },
  { value: "Tahoma, Geneva, sans-serif",            label: "Tahoma" },
  { value: "Verdana, Geneva, sans-serif",           label: "Verdana" },
  // Google Fonts (require the <link> in <Head>)
  { value: "'Inter', sans-serif",                   label: "Inter" },
  { value: "'Lato', sans-serif",                    label: "Lato" },
  { value: "'Merriweather', Georgia, serif",        label: "Merriweather" },
  { value: "'Roboto', sans-serif",                  label: "Roboto" },
];

export default function Settings({ dbWarning, recordingsCount, settings, onSettingChange, onShowOnboarding }) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(settings.userName);

  const totalMB = dbWarning?.text?.match(/([\d.]+\s*(MB|KB))/)?.[0] ?? "—";
  const isLikelyWebView = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIosWebView = /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua);
    const isAndroidWebView = /; wv\)/.test(ua) || /Version\/\d+\.\d+ Chrome\/\d+/.test(ua);
    const hasWebViewTokens = /WebView|Line\//i.test(ua);
    return isIosWebView || isAndroidWebView || hasWebViewTokens;
  }, []);

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
        <div className={styles.headerLeft}>
          <div className={styles.title}>Settings</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/K_Logo.png" alt="Kahija" className={styles.headerLogo} />
      </div>

      <div className={styles.scroll}>

        {/* Recording */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>Recording</div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>🔇</span>
            <span className={styles.rowLabel}>Auto-pause on silence [2 sec]</span>
            <button
              className={`${styles.toggle} ${styles.toggleOn} ${styles.toggleLocked}`}
              aria-label="Auto-pause always on"
              disabled
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>⏱</span>
            <span className={styles.rowLabel}>Silence timeout</span>
            <div className={styles.stepper}>
              <button className={styles.stepBtn} onClick={() => onSettingChange("silenceSec", Math.max(2, settings.silenceSec - 1))}>−</button>
              <span className={styles.stepVal}>{settings.silenceSec}s</span>
              <button className={styles.stepBtn} onClick={() => onSettingChange("silenceSec", Math.min(10, settings.silenceSec + 1))}>+</button>
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

        {/* Appearance */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>Appearance</div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>🔤</span>
            <span className={styles.rowLabel}>Font</span>
            <select
              className={styles.fontSelect}
              value={settings.fontFamily || "system"}
              onChange={(e) => onSettingChange("fontFamily", e.target.value)}
            >
              {FONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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

        {isLikelyWebView && (
          <div className={styles.webViewWarning}>
            Audio recording and transcription may not work correctly inside this WebView. Open Kahija in your browser for the best experience.
          </div>
        )}

        {/* About */}
        <div className={styles.group}>
          <div className={styles.groupLabel}>About</div>
          <button className={styles.rowButton} onClick={onShowOnboarding}>
            <span className={styles.rowIcon}>ℹ️</span>
            <span className={styles.rowLabel}>How Kahija (v1.0) works</span>
            <span className={styles.rowValMuted}>›</span>
          </button>
        </div>

      </div>
    </div>
  );
}
