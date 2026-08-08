import { useState, useEffect, useRef } from "react";
// ── Toggle: change false → true to preview new onboarding content ──
const USE_NEW_ONBOARDING = true;
import { ONBOARDING_PAGES as OLD_PAGES } from "../content/onboardingContent";
import { ONBOARDING_PAGES as NEW_PAGES } from "../content/latestOnboardingContent";
const ONBOARDING_PAGES = USE_NEW_ONBOARDING ? NEW_PAGES : OLD_PAGES;
import styles from "../styles/onboarding.module.css";
import { getExampleDateLabel } from "../lib/SharedHelper.js";


/* ─── Small inline icons (no external icon library needed) ─── */
function MicIcon({ size = 24, color = "#FBF8F2" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill={color} />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function CheckIcon({ size = 12, color = "#1B1E2E" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Waveform bars — used on hero + demo slide ─── */
function Waveform({ bars = 24, active = true }) {
  const heights = useRef(
    Array.from({ length: bars }, () => 0.28 + Math.random() * 0.72)
  ).current;
  return (
    <div className={styles.waveform}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={active ? styles.waveBarActive : styles.waveBar}
          style={{ height: `${h * 100}%`, animationDelay: `${(i % 7) * 0.09}s` }}
        />
      ))}
    </div>
  );
}

function OnboardingSlide({ page, onAction }) {
  if (page.type === "hero") {
    return (
      <section className={styles.heroSlide}>
        <div className={styles.heroIconWrap}>
          <MicIcon />
        </div>
        <h1 className={styles.heroTitle}>{page.title}</h1>
        <p className={styles.heroText}>{page.description}</p>
        <div className={styles.heroWave}>
          <Waveform bars={26} />
        </div>
        <button className={styles.primaryBtn} onClick={onAction}>{page.cta}</button>
      </section>
    );
  }

  if (page.type === "problem") {
    return (
      <section className={`${styles.slideCard} ${styles.problemSlide}`}>
        <div className={styles.cardEyebrow}>{page.eyebrow}</div>
        <div className={styles.timelineFlow}>
          {page.lines.map((line, index) => (
            <div
              key={line}
              className={`${styles.timelineStep} ${index === page.lines.length - 1 ? styles.timelineStepLast : ""}`}
            >
              {line}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (page.type === "steps") {
    return (
      <section className={`${styles.slideCard} ${styles.stepsSlide}`}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.stepsList}>
          {page.steps.map((step, i) => (
            <div key={step.number} className={styles.stepItem}>
              <div className={styles.stepNumberCol}>
                <div className={`${styles.stepNumber} ${i === 0 ? styles.stepNumberFirst : ""}`}>
                  {step.number}
                </div>
                {i < page.steps.length - 1 && <div className={styles.stepConnector} />}
              </div>
              <div className={styles.stepBody}>
                <div className={styles.stepLabel}>{step.label}</div>
                <div className={styles.stepDetail}>{step.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (page.type === "tips") {
    return (
      <section className={`${styles.slideCard} ${styles.tipsSlide}`}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.tipsList}>
          {page.points.map((point) => (
            <div key={point.text} className={styles.tipItem}>
              <span className={styles.tipIcon}>{point.icon}</span>
              <span>{point.text.replace("{{exampleDate}}", getExampleDateLabel())}</span>
            </div>
          ))}


        </div>
      </section>
    );
  }
  if (page.type === "demo") {
    return <DemoSlide page={page} />;
  }

  if (page.type === "useCases") {
    return (
      <section className={styles.useCasesSlide}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.useCaseGrid}>
          {page.items.map((item, i) => (
            <div key={item} className={i % 2 === 0 ? styles.useCaseTagWarm : styles.useCaseTagCool}>
              {item}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (page.type === "privacy") {
    return (
      <section className={`${styles.slideCard} ${styles.privacySlide}`}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.privacyList}>
          {page.points.map((point) => (
            <div key={point} className={styles.privacyItem}>
              <span className={styles.privacyIcon}><CheckIcon /></span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.ctaSlide}>
      <div className={styles.ctaBlock}>
        <h2 className={styles.ctaTitle}>{page.title}</h2>
        <p className={styles.ctaText}>{page.description}</p>
        <button className={styles.primaryBtn} onClick={onAction}>{page.cta}</button>
      </div>
    </section>
  );
}

/* ─── Demo slide — waveform morphs into structured chips ─── */
function DemoSlide({ page }) {
  const [morphed, setMorphed] = useState(false);

  useEffect(() => {
    setMorphed(false);
    // Give the user enough time to actually read the transcript before it
    // morphs into chips — roughly 220ms/word (a comfortable reading pace),
    // floored at 2.6s for short demos and capped at 6.5s so it never drags.
    const wordCount = (page.input || "").trim().split(/\s+/).filter(Boolean).length;
    const readDelay = Math.min(6500, Math.max(2600, wordCount * 220));
    const t = setTimeout(() => setMorphed(true), readDelay);
    return () => clearTimeout(t);
  }, [page]);

  return (
    <section className={styles.demoSlide}>
      <div className={styles.sectionTitle}>{page.title}</div>
      <div className={styles.demoStage}>
        <div className={`${styles.demoInputState} ${morphed ? styles.demoStateHidden : ""}`}>
          <div className={styles.demoLabel}>
            <MicIcon size={12} color="#E08A2E" /> What you say
          </div>
          <div className={styles.demoWaveCard}>
            <Waveform bars={28} />
          </div>
          <p className={styles.audioInput}>{page.input}</p>
        </div>

        <div className={`${styles.demoOutputState} ${morphed ? "" : styles.demoStateHidden}`}>
          <div className={styles.demoLabelCool}>Structured, instantly</div>
          <div className={styles.outputList}>
            {page.output.map((item, i) => (
              <div key={i} className={styles.outputItem} style={{ animationDelay: `${i * 0.1}s` }}>
                <span className={styles.outputIcon}>
                  {item.icon === "note" ? "📝" : "⚡"}
                </span>
                <div className={styles.outputContent}>
                  <div className={styles.outputTitle}>{item.title}</div>
                  <div className={styles.outputDetail}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OnboardingPanel({ onAction, onClose, showClose = false }) {
  const [pageIndex, setPageIndex] = useState(0);
  const total = ONBOARDING_PAGES.length;
  const page = ONBOARDING_PAGES[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === total - 1;

  return (
    <div className={styles.panel}>
      <div className={styles.topBar}>
        <div className={styles.progressLabel}>Story {pageIndex + 1} / {total}</div>
        {showClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close onboarding">
            ✕
          </button>
        )}
      </div>

      <div className={styles.slideViewport}>
        <OnboardingSlide
          page={page}
          onAction={() => (isLast ? onAction?.() : setPageIndex((v) => Math.min(total - 1, v + 1)))}
        />
      </div>

      <div className={styles.footer}>
        <div className={styles.dots}>
          {ONBOARDING_PAGES.map((item, index) => (
            <span key={item.id} className={`${styles.dot} ${index === pageIndex ? styles.dotActive : ""}`} />
          ))}
        </div>
        <div className={styles.navRow}>
          <button
            className={styles.arrowBtn}
            onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
            disabled={isFirst}
            aria-label="Previous story page"
          >
            ←
          </button>
          <button
            className={styles.arrowBtn}
            onClick={() => setPageIndex((value) => Math.min(total - 1, value + 1))}
            disabled={isLast}
            aria-label="Next story page"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
