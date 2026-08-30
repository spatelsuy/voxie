import { useState } from "react";
import styles from "../styles/help.module.css";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&family=Sora:wght@400;500;600;700&display=swap');
`;

const COLORS = {
  ink: "#1B1E2E", mist: "#6B6F85", faint: "#B5AF9C",
  paper: "#FBF8F2", line: "#EDE6D8", amber: "#E08A2E",
};

const ALL_SECTIONS = [
  {
    heading: null, // no heading for the top general questions
    items: [
      { q: "What is Kahija?", a: "Kahija turns your spoken words into tasks, reminders, and notes — automatically. You just talk, and Kahija organizes it for you." },
      { q: "How does it work?", a: "Tap the circle, speak naturally, tap again to stop. Kahija listens, transcribes, and creates activities from what you said — no typing needed." },
      { q: "Is it free?", a: "Yes — Kahija is free to use right now, during early access." },
      { q: "Do I need to type anything?", a: "No. Everything happens through your voice. Typing is only there as an optional backup." },
      { q: "What if I pause while talking?", a: "Kahija waits for you. Take your time, gather your thoughts — it won't cut you off mid-sentence." },
      { q: "Does it work in noisy places?", a: "Yes — though a headset helps if it's really loud. It's a nice-to-have, never required." },
      { q: "What if it mishears something?", a: "You can review and edit anything Kahija captures before it's final. Nothing is locked in automatically." },
      { q: "Can I edit what it captured?", a: "Yes. Every activity and note can be edited, corrected, or deleted anytime from your Dashboard." },
      { q: "What counts as an \u201cactivity\u201d?", a: "Anything you need to do, remember, or attend. Kahija automatically figures out the details — like dates, deadlines, and priority." },
      { q: "How is this different from Siri or Google Assistant reminders?", a: "Assistants need exact commands. Kahija understands natural, rambling speech — multiple thoughts in one go, no special phrasing required." },
      { q: "Is Kahija finished, or still being built?", a: "Kahija is in early access and actively improving. Your feedback directly shapes what gets built next." },
    ],
  },
  {
    heading: "Recording",
    items: [
      { q: "How do I start a recording?", a: "Tap the big circle on the Record tab. Tap again to stop." },
      { q: "Can I pause mid-recording?", a: "Yes — while recording a Pause button appears below the circle. Tap it to pause, then tap the circle again to resume." },
      { q: "Is there a recording time limit?", a: "Each recording captures up to 5 minutes of actual talking time. Pauses don't count against that — only real speaking time." },
      { q: "Can I use it hands-free?", a: "Yes — once it's recording, your hands are free the whole time. Just make sure you start and stop it safely." },
      { q: "What is the headset tip about?", a: "Using a headset reduces background noise and gives the AI cleaner audio, which improves transcription accuracy. It's optional." },
      { q: "Can it record other people, like in a meeting?", a: "Kahija is built for capturing your own thoughts. If others are speaking nearby, make sure you have their consent — recording laws vary by location." },
    ],
  },
  {
    heading: "Sync & Storage",
    items: [
      { q: "Is my audio stored on your servers?", a: "Your voice goes to Groq's AI to create a transcript and find your tasks. By default, nothing is stored on Kahija's own servers unless you turn on sync." },
      { q: "Where is my data actually stored?", a: "By default, everything stays right on your device. Cloud sync is optional, and only happens if you turn it on yourself." },
      { q: "What is Kahija DB?", a: "Kahija DB is a secure cloud store (backed by Supabase). Your data is AES-256-GCM encrypted before it leaves your device — the key is derived server-side and never sent to the browser." },
      { q: "How do I sync across devices?", a: "Sign in with Google on the Profile tab, then tap 'Sync to Kahija DB'. Repeat on each device. Sync merges data both ways." },
      { q: "What does 'Clear Stored Data' do?", a: "It deletes the encrypted backup in Kahija DB. Your local data on this device is not affected." },
      { q: "What does 'Clear Local Data' do?", a: "It wipes all recordings, transcripts, and activities stored on this device only. Your cloud backup is untouched." },
      { q: "Can I sync this with Google Calendar?", a: "Yes — Kahija can push your dated activities straight into a dedicated calendar in your Google account, kept separate from your existing events." },
      { q: "What about Outlook?", a: "Outlook integration is on the way. For now, you can export any activity as a calendar file and import it manually." },
    ],
  },
  {
    heading: "Account & Privacy",
    items: [
      { q: "Do I need to sign in?", a: "No. The app works fully offline. Sign-in is only required for cloud sync." },
      { q: "Do I need an internet connection?", a: "Yes — Kahija needs internet to transcribe your voice and identify your activities." },
      { q: "What data does Kahija store?", a: "Recordings and transcripts are stored locally in your browser's IndexedDB. When you sync, an encrypted snapshot is uploaded to Kahija DB. Kahija does not access the plaintext content." },
      { q: "What languages does it support?", a: "Kahija currently works best in English, with more languages on the roadmap." },
    ],
  },
];

// Flatten all items into a single index space so one openIndex controls everything
const FLAT_ITEMS = [];
ALL_SECTIONS.forEach((section) => {
  if (section.heading) FLAT_ITEMS.push({ type: "heading", label: section.heading });
  section.items.forEach((item) => FLAT_ITEMS.push({ type: "item", ...item }));
});

function FAQRow({ item, isOpen, onToggle, globalIndex }) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.line}` }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "20px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ fontFamily: "Sora, sans-serif", fontSize: 16.5, fontWeight: 600, color: COLORS.ink }}>
          {item.q}
        </span>
        <span style={{
          fontFamily: "Sora, sans-serif", fontSize: 22, color: COLORS.amber,
          transform: isOpen ? "rotate(45deg)" : "rotate(0deg)", transition: "transform 0.2s ease",
          flexShrink: 0, marginLeft: 16,
        }}>
          +
        </span>
      </button>
      <div style={{ maxHeight: isOpen ? 300 : 0, overflow: "hidden", transition: "max-height 0.3s ease" }}>
        <p style={{
          fontFamily: "Sora, sans-serif", fontSize: 14.5, lineHeight: 1.6, color: COLORS.mist,
          padding: "0 4px 20px", margin: 0,
        }}>
          {item.a}
        </p>
      </div>
    </div>
  );
}

// ← Add as many YouTube Shorts (or regular videos) as you like.
const VIDEOS = [
  { id: "kNzvPxKW4Qs", title: "Kahija — Getting Started" },
  { id: "L1hy4aVdGFQ", title: "See Kahija in action" },
];

export default function Help() {
  const [openIndex,  setOpenIndex]  = useState(0);
  const [videoIndex, setVideoIndex] = useState(0);

  const prevVideo = () => setVideoIndex((i) => (i - 1 + VIDEOS.length) % VIDEOS.length);
  const nextVideo = () => setVideoIndex((i) => (i + 1) % VIDEOS.length);

  // Count only item rows to map openIndex correctly
  let itemCounter = -1;

  return (
    <div className={styles.wrap}>
      <style>{FONT_IMPORT}</style>

      <div style={{ background: COLORS.paper, display: "flex", justifyContent: "center", padding: "0 0 60px" }}>
        <div style={{ width: "90%", margin: "0 auto", padding: "40px 0 0" }}>

          {/* ── Video carousel ── */}
          <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 600, fontSize: 30, color: COLORS.ink, marginBottom: 6 }}>
            Watch Kahija in action
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 14, color: COLORS.faint, marginBottom: 20 }}>
            See how Kahija turns your voice into organised activities.
          </div>

          {/* video frame with overlaid chevron buttons */}
          <div style={{ position: "relative", width: "100%", marginBottom: 12 }}>
            {/* 16:9 aspect box — capped so Shorts don't go portrait-tall */}
            <div style={{
              position: "relative", width: "100%", paddingBottom: "56.25%",
              maxHeight: 300, borderRadius: 16,
              overflow: "hidden", border: `1px solid ${COLORS.line}`,
              boxShadow: "0 4px 24px rgba(27,30,46,0.08)",
            }}>
              <iframe
                key={VIDEOS[videoIndex].id}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
                src={`https://www.youtube.com/embed/${VIDEOS[videoIndex].id}`}
                title={VIDEOS[videoIndex].title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Left chevron — only when more than one video */}
            {VIDEOS.length > 1 && (
              <button
                onClick={prevVideo}
                aria-label="Previous video"
                style={{
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.92)", border: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 2, transition: "background 0.15s, transform 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#fff"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.92)"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}

            {/* Right chevron */}
            {VIDEOS.length > 1 && (
              <button
                onClick={nextVideo}
                aria-label="Next video"
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.92)", border: "none",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", zIndex: 2, transition: "background 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#fff"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.92)"}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>

          {/* title, counter, dots */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 44 }}>
            <div style={{ fontFamily: "Sora, sans-serif", fontSize: 13, fontWeight: 600, color: COLORS.ink, textAlign: "center" }}>
              {VIDEOS[videoIndex].title}
            </div>
            {VIDEOS.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* dots */}
                <div style={{ display: "flex", gap: 5 }}>
                  {VIDEOS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setVideoIndex(i)}
                      aria-label={`Go to video ${i + 1}`}
                      style={{
                        width: i === videoIndex ? 20 : 6, height: 6,
                        borderRadius: 99, border: "none", padding: 0,
                        background: i === videoIndex ? COLORS.amber : "#d1c9b8",
                        cursor: "pointer", transition: "width 0.25s ease, background 0.2s",
                      }}
                    />
                  ))}
                </div>
                {/* counter */}
                <span style={{ fontFamily: "Sora, sans-serif", fontSize: 11, color: COLORS.faint, letterSpacing: "0.04em" }}>
                  {videoIndex + 1} / {VIDEOS.length}
                </span>
              </div>
            )}
          </div>

          {/* ── FAQ title ── */}
          <div style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 600, fontSize: 30, color: COLORS.ink, marginBottom: 6 }}>
            Frequently Asked Questions
          </div>
          <div style={{ fontFamily: "Sora, sans-serif", fontSize: 14, color: COLORS.faint, marginBottom: 28 }}>
            Everything you need to know about Kahija.
          </div>

          {/* All rows */}
          <div>
            {FLAT_ITEMS.map((row, i) => {
              if (row.type === "heading") {
                return (
                  <div key={`h-${i}`} style={{
                    fontFamily: "Sora, sans-serif", fontSize: 11, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    color: COLORS.faint, padding: "28px 4px 4px",
                  }}>
                    {row.label}
                  </div>
                );
              }
              itemCounter += 1;
              const idx = itemCounter;
              return (
                <FAQRow
                  key={`q-${i}`}
                  item={row}
                  isOpen={openIndex === idx}
                  onToggle={() => setOpenIndex(openIndex === idx ? -1 : idx)}
                />
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 40, textAlign: "center" }}>
            <span style={{ fontFamily: "Sora, sans-serif", fontSize: 13.5, color: COLORS.faint }}>
              Still have questions?{" "}
            </span>
            <span style={{ fontFamily: "Sora, sans-serif", fontSize: 13.5, color: COLORS.amber, fontWeight: 600, cursor: "pointer" }}>
              Contact us
            </span>
          </div>

        </div>
      </div>
    </div>
  );
}
