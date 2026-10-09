import { useEffect, useMemo, useState } from "react";
import styles from "../styles/settings.module.css";

const TIMEZONE_OPTIONS = Intl.supportedValuesOf
  ? Intl.supportedValuesOf("timeZone")
  : [
      "UTC",
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Anchorage", "America/Adak", "Pacific/Honolulu",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
      "Asia/Dubai", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
      "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai",
      "Australia/Sydney", "Australia/Adelaide", "Australia/Perth",
      "Pacific/Auckland", "Pacific/Fiji",
      "Africa/Cairo", "Africa/Johannesburg", "America/Sao_Paulo",
      "America/Argentina/Buenos_Aires", "America/Toronto", "America/Vancouver",
    ];

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

export const LIGHT_COLOR_THEMES = [
  { id: "pure-white", label: "White",    bg: "#ffffff", card: "#ffffff", border: "#e2e8f0" },
  { id: "slate",      label: "Slate",    bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0" },
  { id: "gray",       label: "Cool Gray",bg: "#f3f4f6", card: "#ffffff", border: "#e5e7eb" },
  { id: "zinc",       label: "Zinc",     bg: "#fafafa", card: "#ffffff", border: "#e4e4e7" },
  { id: "warm-cream", label: "Cream",    bg: "#fdfbf7", card: "#ffffff", border: "#eae5d9" },
  { id: "soft-amber", label: "Amber",    bg: "#fffbeb", card: "#ffffff", border: "#fde68a" },
  { id: "soft-sky",   label: "Sky",      bg: "#f0f9ff", card: "#ffffff", border: "#bae6fd" },
  { id: "mint",       label: "Mint",     bg: "#f0fdf4", card: "#ffffff", border: "#bbf7d0" },
  { id: "lavender",   label: "Lavender", bg: "#f5f3ff", card: "#ffffff", border: "#ddd6fe" },
  { id: "rose",       label: "Rose",     bg: "#fff1f2", card: "#ffffff", border: "#fecdd3" },
];

export default function Settings({ dbWarning, recordingsCount, settings, onSettingChange, onShowOnboarding }) {
  const localTimezone = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC";
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
          <div className={styles.row}>
            <span className={styles.rowIcon}>🌍</span>
            <span className={styles.rowLabel}>Time zone</span>
            <select
              className={styles.fontSelect}
              value={settings.userTimezone || localTimezone}
              onChange={(e) => onSettingChange("userTimezone", e.target.value)}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
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
              value={settings.fontFamily || FONT_OPTIONS[0].value}
              onChange={(e) => onSettingChange("fontFamily", e.target.value)}
            >
              {FONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className={`${styles.row} ${styles.colorRow}`}>
            <div className={styles.colorRowHeader}>
              <span className={styles.rowIcon}>🎨</span>
              <span className={styles.rowLabel}>Page Background</span>
            </div>
            <div className={styles.paletteGrid}>
              {LIGHT_COLOR_THEMES.map((theme) => {
                const isSelected = (settings.themeColor || "pure-white") === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchActive : ""}`}
                    onClick={() => onSettingChange("themeColor", theme.id)}
                    title={theme.label}
                    aria-label={`Select ${theme.label} theme`}
                  >
                    <span
                      className={styles.swatchCircle}
                      style={{ backgroundColor: theme.bg }}
                    />
                    <span className={styles.swatchLabel}>{theme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.row}>
            <span className={styles.rowIcon}>📅</span>
            <span className={styles.rowLabel}>Schedule window</span>
            <div className={styles.stepper}>
              <button className={styles.stepBtn} onClick={() => onSettingChange("scheduleWindow", Math.max(3, (settings.scheduleWindow ?? 7) - 1))}>−</button>
              <span className={styles.stepVal}>{settings.scheduleWindow ?? 7}d</span>
              <button className={styles.stepBtn} onClick={() => onSettingChange("scheduleWindow", Math.min(30, (settings.scheduleWindow ?? 7) + 1))}>+</button>
            </div>
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
