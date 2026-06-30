import { useState } from "react";
import { ONBOARDING_PAGES } from "../content/onboardingContent";
import styles from "../styles/onboarding.module.css";

function OnboardingSlide({ page, onAction }) {
  if (page.type === "hero") {
    return (
      <section className={styles.heroSlide}>
        <div className={styles.heroLogo}>{page.logo}</div>
        <h1 className={styles.heroTitle}>{page.title}</h1>
        <p className={styles.heroText}>{page.description}</p>
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
            <div key={line} className={`${styles.timelineStep} ${styles[`timelineStep${index}`] || ""}`}>
              {line}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (page.type === "solution") {
    return (
      <section className={`${styles.slideCard} ${styles.solutionSlide}`}>
        <div className={styles.cardEyebrow}>{page.eyebrow}</div>
        <p className={styles.solutionLead}>{page.lead}</p>
        <div className={styles.solutionList}>
          {page.bullets.map((bullet) => (
            <div key={bullet} className={styles.solutionItem}>{bullet}</div>
          ))}
        </div>
      </section>
    );
  }

  if (page.type === "demoInput") {
    return (
      <section className={`${styles.slideCard} ${styles.solutionSlide}`}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.demoCard}>
          <div className={styles.demoLabel}>{page.label}</div>
          <div className={styles.audioInput}>{page.text}</div>
        </div>
      </section>
    );
  }

  if (page.type === "demoOutput") {
    return (
      <section className={styles.demoSlide}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.demoCard}>
          <div className={styles.outputList}>
            {page.items.map((item) => (
              <div key={item.title} className={styles.outputItem}>
                <div className={styles.outputIcon}>{item.icon}</div>
                <div className={styles.outputContent}>
                  <div className={styles.outputTitle}>{item.title}</div>
                  <div className={styles.outputDetail}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (page.type === "useCases") {
    return (
      <section className={styles.useCasesSlide}>
        <div className={styles.sectionTitle}>{page.title}</div>
        <div className={styles.useCaseGrid}>
          {page.items.map((item) => (
            <div key={item} className={styles.useCaseTag}>{item}</div>
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
        <OnboardingSlide page={page} onAction={onAction} />
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
