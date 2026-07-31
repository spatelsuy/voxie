import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../styles/recorder.module.css";
import { ContinuousTranscriber } from "../lib/ContinuousTranscriber";

/* ─── Constants ───────────────────────────────────── */
const AUTO_A2T_MAX_SECONDS = 120;
const AUTO_A2T_MAX_BYTES   = 2 * 1024 * 1024;

/* ─── Rotating idle messages (label + hint pairs) ─── */
const IDLE_MESSAGES = [
  {
    label: "Capture Your Thoughts Before They Disappear. Just Speak.",
    hint:  "Speak naturally. Kahija turns your voice into tasks, reminders, events instantly.",
  },
  {
    label: "Driving? Cooking? Just Tap and Talk.",
    hint:  "Kahija listens hands-free and organises everything for you.",
  },
  {
    label: "No Typing. No Notes App. Just Your Voice.",
    hint:  "Say 'Remind me Friday at 3pm to call the doctor' — Kahija handles the rest.",
  },
  {
    label: "Your Voice Is the Fastest Way to Capture an Idea.",
    hint:  "Tap the circle, speak, tap again. Your items appear in Due Date view automatically.",
  },
  {
    label: "Never Forget a Task, Event, or Reminder Again.",
    hint:  "Kahija extracts your intentions and places them on your schedule.",
  },
];
const MESSAGE_INTERVAL_MS = 15000;

/* ─── Component ───────────────────────────────────── */
export default function VoiceRecorder({
  onRecordingSaved,
  onAutoA2T,
  onTextSubmit,
  autoA2TStatus,
  onLearnMore,
  liveTranscript,     // string — accumulated transcript, owned by parent (index.js)
  onTranscriptChunk,  // (text, isFinal) => void — called per speech segment
  silenceSec,         // number — seconds of silence before cutting (default 1.5)
  userName,           // string — forwarded to the backend
}) {
  const [recState,         setRecState]         = useState("idle"); // idle | recording | paused
  const [statusText,       setStatusText]        = useState("");
  const [pauseLabel,       setPauseLabel]        = useState("Pause");
  const [isTextModalOpen,  setIsTextModalOpen]   = useState(false);
  const [textValue,        setTextValue]         = useState("");
  const [textError,        setTextError]         = useState("");
  const [isSubmittingText, setIsSubmittingText]  = useState(false);
  const [msgIndex,         setMsgIndex]          = useState(0);
  const [msgVisible,       setMsgVisible]        = useState(true);

  const transcriberRef      = useRef(null);  // ContinuousTranscriber instance
  const startTimeRef        = useRef(null);
  const secondsRef          = useRef(0);
  const isPausedRef         = useRef(false);
  const timerIntervalRef    = useRef(null);
  const uiIntervalRef       = useRef(null);
  const waveRafRef          = useRef(null);
  const canvasRef           = useRef(null);
  // Accumulates transcript synchronously — avoids stale React state closure
  const transcriptAccumRef  = useRef("");

  /* ── Timer ─────────────────────────────────────── */
  function startTimer() {
    secondsRef.current  = 0;
    isPausedRef.current = false;
    timerIntervalRef.current = setInterval(() => {
      if (!isPausedRef.current) secondsRef.current++;
    }, 1000);
  }
  function pauseTimer()  { isPausedRef.current = true; }
  function resumeTimer() { isPausedRef.current = false; }
  function stopTimer()   { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }

  function formatDur(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  /* ── Waveform — reads from the transcriber's AnalyserNode ─────── */
  function startWaveform() {
    const draw = () => {
      waveRafRef.current = requestAnimationFrame(draw);
      const analyser = transcriberRef.current?.getAnalyser();
      const canvas   = canvasRef.current;
      if (!analyser || !canvas) return;

      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);

      const c = canvas.getContext("2d");
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.strokeStyle = "rgba(255,255,255,0.85)";
      c.lineWidth   = 2.5;
      c.lineCap     = "round";
      c.beginPath();
      const sw = canvas.width / buf.length;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const y = (buf[i] / 128.0) * (canvas.height / 2);
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
        x += sw;
      }
      c.lineTo(canvas.width, canvas.height / 2);
      c.stroke();
    };
    waveRafRef.current = requestAnimationFrame(draw);
  }

  function stopWaveform() {
    if (waveRafRef.current) { cancelAnimationFrame(waveRafRef.current); waveRafRef.current = null; }
  }

  /* ── UI tick — updates the displayed timer ──────────────────────  */
  function startUITick() {
    uiIntervalRef.current = setInterval(() => {
      if (transcriberRef.current?.isRecording) {
        setStatusText(formatDur(secondsRef.current));
      }
    }, 300);
  }
  function stopUITick() { clearInterval(uiIntervalRef.current); uiIntervalRef.current = null; }

  /* ── Text modal ────────────────────────────────── */
  function openTextModal()  { setTextError(""); setIsTextModalOpen(true); }
  function closeTextModal() { if (isSubmittingText) return; setTextError(""); setIsTextModalOpen(false); }

  async function handleTextSubmit() {
    const trimmedText = textValue.trim();
    if (!trimmedText) { setTextError("Enter some text to submit."); return; }
    if (!onTextSubmit) return;
    setIsSubmittingText(true);
    setTextError("");
    try {
      await onTextSubmit(trimmedText);
      setTextValue("");
      setIsTextModalOpen(false);
    } catch (error) {
      setTextError(error.message || "Unable to submit text.");
    } finally {
      setIsSubmittingText(false);
    }
  }

  /* ── Start recording ───────────────────────────── */
  async function startRecording() {
    try {
      const transcriber = new ContinuousTranscriber({
        backendUrl:  "/api/transcribe-only",
        userName:    userName || "SunilK",
        silenceMs:   (silenceSec ?? 2) * 1000,
        autoPauseMs: 5000,
        onTranscript: ({ transcription, isFinal }) => {
          const text = (transcription || "").trim();
          if (text) {
            // Write to ref synchronously — this is always current at save time
            transcriptAccumRef.current = transcriptAccumRef.current
              ? transcriptAccumRef.current + " " + text
              : text;
            // Also update parent state for live display
            onTranscriptChunk?.(text, isFinal);
          }
        },
        onError: (err) => console.error("[Transcriber]", err),
        onStatusChange: () => {},
        // Auto-pause: show paused UI, user can tap Resume or just speak
        onAutoPause: () => {
          pauseTimer();
          setPauseLabel("Resume");
          setRecState("paused");
          setStatusText("Auto-paused — speak or tap Resume");
        },
        // Auto-resume by voice: restore recording UI
        onAutoResume: () => {
          resumeTimer();
          setPauseLabel("Pause");
          setRecState("recording");
        },
      });

      await transcriber.start();
      transcriberRef.current     = transcriber;
      startTimeRef.current       = Date.now();
      transcriptAccumRef.current = "";   // reset accumulator for new session

      startTimer();
      startWaveform();
      startUITick();
      setRecState("recording");
      setPauseLabel("Pause");
      setStatusText("00:00");
    } catch (err) {
      setStatusText("Microphone access denied");
      console.error(err);
    }
  }

  /* ── Pause / Resume ────────────────────────────── */
  function togglePause() {
    const t = transcriberRef.current;
    if (!t) return;

    if (!isPausedRef.current) {
      // ── Manual pause ──────────────────────────────────────────────
      // Stop the RMS watcher so no soft-stop or auto-pause can fire
      if (t._rafId) { cancelAnimationFrame(t._rafId); t._rafId = null; }
      if (t.sendRecorder?.state    === "recording") t.sendRecorder.pause();
      if (t.archiveRecorder?.state === "recording") t.archiveRecorder.pause();
      pauseTimer();
      setPauseLabel("Resume");
      setRecState("paused");
    } else {
      // ── Manual resume (works for both manual pause and auto-pause) ─
      if (t._autoPaused) {
        // Was auto-paused — use the transcriber's own resume path
        // so _autoPaused flag is cleared and RMS monitor restarts cleanly
        t.manualResume();
      } else {
        // Was manually paused — resume recorders + restart RMS monitor
        if (t.sendRecorder?.state    === "paused") t.sendRecorder.resume();
        if (t.archiveRecorder?.state === "paused") t.archiveRecorder.resume();
        t._startRMSMonitor();
      }
      resumeTimer();
      setPauseLabel("Pause");
      setRecState("recording");
    }
  }

  /* ── Stop recording ────────────────────────────── */
  function stopRecording() {
    const t = transcriberRef.current;
    if (!t) return;

    stopTimer();
    stopWaveform();
    stopUITick();

    const duration = secondsRef.current;
    const recStart = startTimeRef.current;

    // _onStopped fires from inside _teardown(), which is called only
    // after the final segment's onstop has completed — guaranteeing
    // the archive blob is fully assembled before saveRecording runs.
    t._onStopped = () => saveRecording(t, duration, recStart);
    t.stop();
    transcriberRef.current = null;

    setRecState("idle");
    setPauseLabel("Pause");
    setStatusText("Transcribing…");
  }

  /* ── Save (fired by _onStopped after last segment onstop) ──────── */
  async function saveRecording(t, duration, recStart) {
    try {
      // If the user never spoke, skip saving entirely — nothing useful to store
      if (!(transcriptAccumRef.current || "").trim()) {
        setStatusText("");
        return;
      }

      const fullBlob = t.getFullBlob();
      const url      = URL.createObjectURL(fullBlob);
      const rec = {
        name: "Recording " + new Date(recStart).toLocaleString("en-US", {
          month: "short", day: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
        }),
        id: Date.now(), blob: fullBlob, url,
        size: fullBlob.size, duration, createdAt: new Date(),
        kind: "audio",
      };

      const qualifies = duration <= AUTO_A2T_MAX_SECONDS && fullBlob.size <= AUTO_A2T_MAX_BYTES;

      if (qualifies && onAutoA2T) {
        setStatusText("Analysing…");
        if (onRecordingSaved) await onRecordingSaved(rec);
        // Use the ref — it is always fully current, never stale from React closure
        onAutoA2T(rec, transcriptAccumRef.current || "");
      } else {
        setStatusText(qualifies ? "Saved ✓" : "Saved ✓ — tap A2T in History");
        if (onRecordingSaved) onRecordingSaved(rec);
      }
    } catch (err) {
      alert(`ERROR: ${err.message}\n${err.stack}`);
    }
  }

  /* ── Circle tap ────────────────────────────────── */
  function handleCircleTap() {
    if (recState === "idle" && autoA2TStatus !== "processing") {
      startRecording();
    } else if (recState === "recording" || recState === "paused") {
      stopRecording();
    }
  }

  const isActiveRec = recState === "recording" || recState === "paused";

  /* ── Sync statusText with autoA2TStatus from parent ─────────────  */
  useEffect(() => {
    if (autoA2TStatus === "done")        setStatusText("Done ✓");
    else if (autoA2TStatus === "error")  setStatusText("Failed — try manually");
    else if (autoA2TStatus === null && recState === "idle") setStatusText("");
  }, [autoA2TStatus, recState]);

  /* ── Rotate idle messages every 15 s ──────────────────────────── */
  useEffect(() => {
    if (recState !== "idle") return;
    const id = setInterval(() => {
      setMsgVisible(false);
      setTimeout(() => { setMsgIndex((i) => (i + 1) % IDLE_MESSAGES.length); setMsgVisible(true); }, 400);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [recState]);

  const isLikelyWebView = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /; wv\)/.test(ua) ||
      (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua)) ||
      /FBAN|FBAV|Instagram|Line\/|MicroMessenger|KAKAOTALK|TikTok|Snapchat|Twitter/i.test(ua);
  }, []);

  /* ── Derive circle visual state ────────────────────────────────── */
  const isProcessing = recState === "idle" && autoA2TStatus === "processing";
  const isSaving     = (statusText === "Saving…" || statusText === "Analysing…" || statusText === "Transcribing…")
                       && autoA2TStatus !== "error"
                       && autoA2TStatus !== "done";

  let circleState = "idle";
  if (recState === "recording")  circleState = "recording";
  if (recState === "paused")     circleState = "paused";
  if (isProcessing || isSaving)  circleState = "processing";

  /* ── Labels ────────────────────────────────────── */
  const idleMsg = IDLE_MESSAGES[msgIndex];

  const circleLabel =
    circleState === "recording"  ? statusText || "Recording…"                                            :
    circleState === "paused"     ? statusText                                                             :
    circleState === "processing" ? (autoA2TStatus === "done" ? "Done ✓" : statusText || "Processing…")  :
    autoA2TStatus === "done"     ? "Done — check Inbox"                                                  :
    autoA2TStatus === "error"    ? "Failed — try manually"                                               :
    idleMsg.label;

  const circleHint =
    circleState === "recording"  ? "Tap to stop"                  :
    circleState === "paused"     ? "Tap to stop or click resume"  :
    circleState === "processing" ? ""                             :
    autoA2TStatus === "done" || autoA2TStatus === "error" ? ""    :
    idleMsg.hint;

  const showLearnBtn   = circleState === "idle" && !autoA2TStatus;
  const labelFadeClass = circleState === "idle" && !autoA2TStatus
    ? (msgVisible ? styles.msgVisible : styles.msgHidden)
    : "";

  const showTranscript = isActiveRec || isProcessing || !!(liveTranscript?.trim());

  /* ── Render ────────────────────────────────────── */
  return (
    <div className={styles.wrap}>

      {/* Text input modal */}
      {isTextModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>Text input</div>
                <div className={styles.modalSub}>Type your tasks, reminders, events, or notes</div>
              </div>
              <button className={styles.modalClose} onClick={closeTextModal} disabled={isSubmittingText} aria-label="Close">✕</button>
            </div>
            <textarea
              className={styles.textarea}
              value={textValue}
              onChange={(e) => { setTextValue(e.target.value); if (textError) setTextError(""); }}
              placeholder="Example: Remind me tomorrow at 10am to call the dentist and note that I need to review the Q3 budget."
              rows={8}
            />
            {textError && <div className={styles.textError}>{textError}</div>}
            <div className={styles.modalActions}>
              <button
                className={styles.modalPrimaryBtn}
                onClick={handleTextSubmit}
                disabled={isSubmittingText || !textValue.trim()}
              >
                {isSubmittingText ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WebView warning */}
      {isLikelyWebView && (
        <div className={styles.webViewWarning}>
          Audio recording may not work correctly inside this WebView. Open Kahija in your browser.
        </div>
      )}

      {/* ── Main stage ── */}
      <div className={styles.stage}>
        {/* Big circle */}
        <button
          className={`${styles.circle} ${styles[`circle_${circleState}`]}`}
          onClick={handleCircleTap}
          disabled={isProcessing}
          aria-label={circleState === "idle" ? "Start recording" : "Stop recording"}
        >
          {circleState === "recording" && (
            <>
              <span className={`${styles.ring} ${styles.ring1}`} />
              <span className={`${styles.ring} ${styles.ring2}`} />
            </>
          )}
          {isActiveRec && <canvas ref={canvasRef} className={styles.circleCanvas} />}
          <span className={styles.circleIcon}>
            {circleState === "processing" ? (
              <span className={styles.spinner} />
            ) : circleState === "recording" || circleState === "paused" ? (
              "■"
            ) : (
              "🎙"
            )}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/K_Logo-record.png" alt="Kahija" className={styles.circleLogo} />
        </button>

        {/* Label + hint */}
        <div className={`${styles.circleLabel} ${labelFadeClass}`}>{circleLabel}</div>
        {circleHint && <div className={`${styles.circleHint} ${labelFadeClass}`}>{circleHint}</div>}

        {/* Live transcript box */}
        {showTranscript && (
          <div className={styles.transcriptBox}>
            <div className={styles.transcriptHeader}>
              <span className={styles.transcriptLabel}>Live Transcript</span>
              {isActiveRec && <span className={styles.transcriptDot} />}
            </div>
            <div className={styles.transcriptText}>
              {liveTranscript?.trim()
                ? liveTranscript
                : <span className={styles.transcriptPlaceholder}>Listening… transcript will appear here as you speak.</span>
              }
            </div>
          </div>
        )}

        {/* Learn About Kahija — idle only */}
        {showLearnBtn && (
          <button className={styles.learnBtn} onClick={onLearnMore}>
            Learn About Kahija
          </button>
        )}

        {/* Pause pill */}
        {isActiveRec && (
          <button className={styles.pauseBtn} onClick={togglePause}>
            {pauseLabel}
          </button>
        )}

        {/* Text input trigger */}
        <button
          className={styles.textBtn}
          onClick={openTextModal}
          disabled={isActiveRec || isProcessing}
          aria-label="Type instead"
          title="Type instead of speaking"
        >
          T
        </button>

      </div>
    </div>
  );
}
