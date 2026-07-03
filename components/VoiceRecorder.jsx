import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../styles/recorder.module.css";

/* ─── Constants ───────────────────────────────────── */
const SILENCE_TIMEOUT_MS   = 10 * 1000;
const SILENCE_THRESHOLD    = 5;
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
}) {
  const [recState,          setRecState]          = useState("idle"); // idle | recording | paused
  const [statusText,        setStatusText]        = useState("");
  const [pauseLabel,        setPauseLabel]        = useState("Pause");
  const [isTextModalOpen,   setIsTextModalOpen]   = useState(false);
  const [textValue,         setTextValue]         = useState("");
  const [textError,         setTextError]         = useState("");
  const [isSubmittingText,  setIsSubmittingText]  = useState(false);
  const [msgIndex,          setMsgIndex]          = useState(0);
  const [msgVisible,        setMsgVisible]        = useState(true); // drives fade

  const mediaRecorderRef    = useRef(null);
  const streamRef           = useRef(null);
  const audioChunksRef      = useRef([]);
  const audioContextRef     = useRef(null);
  const analyserRef         = useRef(null);
  const dataArrayRef        = useRef(null);
  const secondsRef          = useRef(0);
  const isPausedRef         = useRef(false);
  const timerIntervalRef    = useRef(null);
  const startTimeRef        = useRef(null);
  const uiIntervalRef       = useRef(null);
  const liveSizeRef         = useRef(0);
  const silenceRafIdRef     = useRef(null);
  const silenceStartedAtRef = useRef(null);
  const isAutoPausedRef     = useRef(false);
  const canvasRef           = useRef(null);

  /* ── Waveform ──────────────────────────────────── */
  function setupWaveform(stream) {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    analyserRef.current     = audioContextRef.current.createAnalyser();
    const src = audioContextRef.current.createMediaStreamSource(stream);
    src.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;
    dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
  }

  function drawWaveform() {
    const canvas = canvasRef.current;
    if (!analyserRef.current || !canvas) return;
    analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
    const c = canvas.getContext("2d");
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = "rgba(255,255,255,0.85)";
    c.lineWidth   = 2.5;
    c.lineCap     = "round";
    c.beginPath();
    const sw = canvas.width / dataArrayRef.current.length;
    let x = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const y = (dataArrayRef.current[i] / 128.0) * (canvas.height / 2);
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      x += sw;
    }
    c.lineTo(canvas.width, canvas.height / 2);
    c.stroke();
  }

  /* ── Timer ─────────────────────────────────────── */
  function startTimer() {
    secondsRef.current  = 0;
    isPausedRef.current = false;
    timerIntervalRef.current = setInterval(() => {
      if (!isPausedRef.current) secondsRef.current++;
    }, 1000);
  }
  function pauseTimer()  { isPausedRef.current = true;  }
  function resumeTimer() { isPausedRef.current = false; }
  function stopTimer()   { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }

  function formatDur(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  /* ── Live UI update ────────────────────────────── */
  function updateUI() {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === "recording") {
      setStatusText(formatDur(secondsRef.current));
    } else if (mr.state === "paused") {
      setStatusText(isAutoPausedRef.current
        ? `${formatDur(secondsRef.current)} — speak to resume`
        : formatDur(secondsRef.current));
    }
    drawWaveform();
  }

  /* ── Silence detection ─────────────────────────── */
  function startSilenceDetection() {
    silenceStartedAtRef.current = null;
    isAutoPausedRef.current     = false;
    function tick() {
      silenceRafIdRef.current = requestAnimationFrame(tick);
      if (!analyserRef.current || !mediaRecorderRef.current) return;
      analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
      let sq = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const v = dataArrayRef.current[i] - 128; sq += v * v;
      }
      const isSilent = Math.sqrt(sq / dataArrayRef.current.length) < SILENCE_THRESHOLD;
      const state    = mediaRecorderRef.current.state;
      if (state === "recording") {
        if (isSilent) {
          if (!silenceStartedAtRef.current) silenceStartedAtRef.current = Date.now();
          if (Date.now() - silenceStartedAtRef.current >= SILENCE_TIMEOUT_MS) {
            mediaRecorderRef.current.pause();
            pauseTimer();
            setPauseLabel("Resume");
            setRecState("paused");
            isAutoPausedRef.current     = true;
            silenceStartedAtRef.current = null;
          }
        } else { silenceStartedAtRef.current = null; }
      } else if (state === "paused" && isAutoPausedRef.current) {
        if (!isSilent) {
          mediaRecorderRef.current.resume();
          resumeTimer();
          setPauseLabel("Pause");
          setRecState("recording");
          isAutoPausedRef.current     = false;
          silenceStartedAtRef.current = null;
        }
      }
    }
    silenceRafIdRef.current = requestAnimationFrame(tick);
  }

  function stopSilenceDetection() {
    if (silenceRafIdRef.current) { cancelAnimationFrame(silenceRafIdRef.current); silenceRafIdRef.current = null; }
    silenceStartedAtRef.current = null;
    isAutoPausedRef.current     = false;
  }

  /* ── MediaRecorder ─────────────────────────────── */
  function createRecorder(stream) {
    const recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm; codecs=opus", audioBitsPerSecond: 24000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) { audioChunksRef.current.push(e.data); liveSizeRef.current += e.data.size; }
    };
    recorder.onstop = saveRecording;
    return recorder;
  }

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

  /* ── Start ─────────────────────────────────────── */
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      });
      streamRef.current      = stream;
      audioChunksRef.current = [];
      liveSizeRef.current    = 0;
      startTimeRef.current   = Date.now();
      setupWaveform(stream);
      mediaRecorderRef.current = createRecorder(stream);
      mediaRecorderRef.current.start();
      startTimer();
      startSilenceDetection();
      uiIntervalRef.current = setInterval(updateUI, 300);
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
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    if (mr.state === "recording") {
      mr.pause(); pauseTimer(); setPauseLabel("Resume"); setRecState("paused");
    } else if (mr.state === "paused") {
      mr.resume(); resumeTimer(); setPauseLabel("Pause"); setRecState("recording");
      isAutoPausedRef.current = false; silenceStartedAtRef.current = null;
    }
  }

  /* ── Stop ──────────────────────────────────────── */
  function stopRecording() {
    stopSilenceDetection();
    mediaRecorderRef.current.stop();
    stopTimer();
    clearInterval(uiIntervalRef.current);
    setRecState("idle");
    setPauseLabel("Pause");
    setStatusText("Saving…");
  }

  /* ── Save ──────────────────────────────────────── */
  async function saveRecording() {
    try {
      const tempBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const duration = secondsRef.current;
      const blob     = tempBlob;
      const url      = URL.createObjectURL(blob);
      const rec = {
        name: "Recording " + new Date(startTimeRef.current).toLocaleString("en-US", {
          month: "short", day: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
        }),
        id: Date.now(), blob, url,
        size: blob.size, duration, createdAt: new Date(),
        kind: "audio",
      };
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close();

      const qualifies = duration <= AUTO_A2T_MAX_SECONDS && blob.size <= AUTO_A2T_MAX_BYTES;
      if (qualifies && onAutoA2T) {
        setStatusText("Analysing…");
        if (onRecordingSaved) await onRecordingSaved(rec);
        onAutoA2T(rec);
      } else {
        setStatusText(qualifies ? "Saved ✓" : "Saved ✓ — tap A2T in History");
        if (onRecordingSaved) onRecordingSaved(rec);
      }
    } catch (err) {
      alert(`ERROR: ${err.message}\n${err.stack}`);
    }
  }

  /* ── Circle tap handler ────────────────────────── */
  function handleCircleTap() {
    if (recState === "idle" && autoA2TStatus !== "processing") {
      startRecording();
    } else if (recState === "recording") {
      stopRecording();
    } else if (recState === "paused") {
      stopRecording();
    }
  }

  const isActiveRec = recState === "recording" || recState === "paused";

  /* ── Clear local statusText when parent reports done/error ── */
  useEffect(() => {
    if (autoA2TStatus === "done") {
      setStatusText("Done ✓");
    } else if (autoA2TStatus === "error") {
      setStatusText("Failed — try manually");
    } else if (autoA2TStatus === null && recState === "idle") {
      // Fully reset after the status clears
      setStatusText("");
    }
  }, [autoA2TStatus, recState]);

  /* ── Rotate idle messages every 15 s (only while idle) ── */
  useEffect(() => {
    if (recState !== "idle") return;
    const interval = setInterval(() => {
      // fade out
      setMsgVisible(false);
      setTimeout(() => {
        setMsgIndex((i) => (i + 1) % IDLE_MESSAGES.length);
        setMsgVisible(true); // fade in
      }, 400); // matches CSS transition duration
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [recState]);

  const isLikelyWebView = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return /; wv\)/.test(ua) ||
      (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua)) ||
      /FBAN|FBAV|Instagram|Line\/|MicroMessenger|KAKAOTALK|TikTok|Snapchat|Twitter/i.test(ua);
  }, []);

  /* ── Derive circle state ───────────────────────── */
  // isSaving: only true while status text is "Analysing…" AND backend hasn't responded yet
  // If autoA2TStatus is "error" or "done", the backend call has resolved — exit processing
  const isProcessing = recState === "idle" && autoA2TStatus === "processing";
  const isSaving     = (statusText === "Saving…" || statusText === "Analysing…")
                       && autoA2TStatus !== "error"
                       && autoA2TStatus !== "done";

  let circleState = "idle";
  if (recState === "recording")  circleState = "recording";
  if (recState === "paused")     circleState = "paused";
  if (isProcessing || isSaving)  circleState = "processing";

  /* ── Derive label and hint ─────────────────────── */
  const idleMsg = IDLE_MESSAGES[msgIndex];

  const circleLabel =
    circleState === "recording"  ? statusText || "Recording…"                                      :
    circleState === "paused"     ? statusText                                                       :
    circleState === "processing" ? (autoA2TStatus === "done" ? "Done ✓" : statusText || "Processing…") :
    autoA2TStatus === "done"     ? "Done — check Due Date"                                         :
    autoA2TStatus === "error"    ? "Failed — try manually"                                         :
    idleMsg.label;

  const circleHint =
    circleState === "recording"  ? "Tap to stop"                    :
    circleState === "paused"     ? "Tap to stop or click resume"  :
    circleState === "processing" ? ""                               :
    autoA2TStatus === "done" || autoA2TStatus === "error" ? ""      :
    idleMsg.hint;

  const showLearnBtn = circleState === "idle" && !autoA2TStatus;
  const labelFadeClass = circleState === "idle" && !autoA2TStatus
    ? (msgVisible ? styles.msgVisible : styles.msgHidden)
    : "";

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

      {/* ── Main screen ── */}
      <div className={styles.stage}>

        {/* Circle */}
        <button
          className={`${styles.circle} ${styles[`circle_${circleState}`]}`}
          onClick={handleCircleTap}
          disabled={isProcessing}
          aria-label={circleState === "idle" ? "Start recording" : "Stop recording"}
        >
          {/* Ripple rings — visible while recording */}
          {circleState === "recording" && (
            <>
              <span className={`${styles.ring} ${styles.ring1}`} />
              <span className={`${styles.ring} ${styles.ring2}`} />
            </>
          )}

          {/* Waveform canvas inside circle when recording */}
          {isActiveRec && (
            <canvas ref={canvasRef} className={styles.circleCanvas} />
          )}

          {/* Icon / spinner overlay */}
          <span className={styles.circleIcon}>
            {circleState === "processing" ? (
              <span className={styles.spinner} />
            ) : circleState === "recording" ? (
              "■"   /* stop symbol */
            ) : circleState === "paused" ? (
              "■"
            ) : (
              "🎙"
            )}
          </span>
        </button>

        {/* Label + hint — fade when rotating */}
        <div className={`${styles.circleLabel} ${labelFadeClass}`}>{circleLabel}</div>
        {circleHint ? (
          <div className={`${styles.circleHint} ${labelFadeClass}`}>{circleHint}</div>
        ) : null}

        {/* Learn About Kahija — idle only, centred */}
        {showLearnBtn && (
          <button className={styles.learnBtn} onClick={onLearnMore}>
            Learn About Kahija
          </button>
        )}

        {/* Pause pill — only visible while active */}
        {isActiveRec && (
          <button className={styles.pauseBtn} onClick={togglePause}>
            {pauseLabel}
          </button>
        )}

        {/* Text input trigger — bottom right */}
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
