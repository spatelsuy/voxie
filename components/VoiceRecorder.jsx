import { useMemo, useRef, useState } from "react";
import styles from "../styles/recorder.module.css";

/* ─── Constants ───────────────────────────────────── */
const SILENCE_TIMEOUT_MS = 10 * 1000;
const SILENCE_THRESHOLD  = 5;

// Smart Auto-A2T thresholds
const AUTO_A2T_MAX_SECONDS = 120;        // 2 minutes
const AUTO_A2T_MAX_BYTES   = 2 * 1024 * 1024; // 2 MB

/* ─── Component ───────────────────────────────────── */
export default function VoiceRecorder({
  onRecordingSaved,
  onAutoA2T,
  onTextSubmit,
  autoA2TStatus,
}) {
  const [recState,   setRecState]   = useState("idle"); // idle | recording | paused
  const [statusText, setStatusText] = useState("Ready");
  const [pauseLabel, setPauseLabel] = useState("Pause");
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [textError, setTextError] = useState("");
  const [isSubmittingText, setIsSubmittingText] = useState(false);

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
    c.fillStyle   = "#f1f5f9";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = "#334155";
    c.lineWidth   = 2.5;
    c.lineCap     = "round";
    c.beginPath();
    const sw = canvas.width / dataArrayRef.current.length;
    let x = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const y = (dataArrayRef.current[i] / 128.0 * canvas.height) / 2;
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
      setStatusText(`🔴 ${formatDur(secondsRef.current)}`);
    } else if (mr.state === "paused") {
      setStatusText(isAutoPausedRef.current
        ? `⏸ ${formatDur(secondsRef.current)} — speak to resume`
        : `⏸ ${formatDur(secondsRef.current)}`);
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

  function openTextModal() {
    setTextError("");
    setIsTextModalOpen(true);
  }

  function closeTextModal() {
    if (isSubmittingText) return;
    setTextError("");
    setIsTextModalOpen(false);
  }

  async function handleTextSubmit() {
    const trimmedText = textValue.trim();
    if (!trimmedText) {
      setTextError("Enter some text to submit.");
      return;
    }
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
      //alert("started recording");
      startTimer();
      startSilenceDetection();
      uiIntervalRef.current = setInterval(updateUI, 300);
      setRecState("recording");
      setPauseLabel("Pause");
      setStatusText("🔴 00:00");
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
    try{
      //alert(`Stopping recording. Chunks: ${audioChunksRef.current.length}`);
      const tempBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      //alert(`tempBlob created. size: ${tempBlob.size} bytes`);
      const duration = secondsRef.current;
      const durationMS = duration*1000;
      //const blob = await fixWebmDuration(tempBlob, durationMS);
      const blob = tempBlob;
      //alert(`Recording stopped. Duration: ${durationMS}ms, size: ${blob.size} bytes`);
      const url = URL.createObjectURL(blob);
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

      /* ── Smart Auto-A2T decision ──────────────────── */
      const qualifies =
        duration <= AUTO_A2T_MAX_SECONDS &&
        blob.size <= AUTO_A2T_MAX_BYTES;

      if (qualifies && onAutoA2T) {
        setStatusText("Saved ✓ — processing…");
        if (onRecordingSaved) await onRecordingSaved(rec);
        onAutoA2T(rec); // fire-and-forget — parent handles status updates
      } else {
        setStatusText(
          qualifies
            ? "Saved ✓"
            : `Saved ✓ — tap A2T in History to process`
        );
        if (onRecordingSaved) onRecordingSaved(rec);
      }
    }catch (err){
      alert(`ERROR: ${err.message}\n${err.stack}`);
    }
  }

  
  const isActiveRec = recState === "recording" || recState === "paused";
  const isLikelyWebView = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";

    const isAndroidWebView = /; wv\)/.test(ua);
    const isIosWebView = /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua);
    const inAppBrowserTokens =
      /FBAN|FBAV|Instagram|Line\/|MicroMessenger|KAKAOTALK|TikTok|Snapchat|Twitter/i.test(ua);

    return isAndroidWebView || isIosWebView || inAppBrowserTokens;
  }, []);

  /* Derive display status — auto-A2T feedback overrides local status when idle */
  const displayStatus =
    recState === "idle" && autoA2TStatus === "processing" ? "🤖 Analysing your recording…" :
    recState === "idle" && autoA2TStatus === "done"       ? "✅ Done — check Inbox tab"     :
    recState === "idle" && autoA2TStatus === "error"      ? "⚠️ A2T failed — try manually"  :
    statusText;

  return (
    <div className={styles.wrap}>
      {isTextModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalTitle}>Text input</div>
                <div className={styles.modalSub}>Type your tasks, reminders, events, or notes</div>
              </div>
              <button className={styles.modalClose} onClick={closeTextModal} disabled={isSubmittingText} aria-label="Close text modal">
                ✕
              </button>
            </div>
            <textarea
              className={styles.textarea}
              value={textValue}
              onChange={(e) => {
                setTextValue(e.target.value);
                if (textError) setTextError("");
              }}
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

      <div className={styles.header}>
        <div className={styles.title}>Record</div>
        <div className={styles.sub}>Speak your tasks, events and reminders</div>
      </div>

      <div className={styles.body}>
        <button className={styles.moreBtn} onClick={openTextModal} disabled={isActiveRec || autoA2TStatus === "processing"} aria-label="Open text input">
          T
        </button>

        {isLikelyWebView && (
          <div className={styles.webViewWarning}>
            Audio recording and transcription may not work correctly inside this WebView. Open Kahija in your browser for the best experience.
          </div>
        )}

        {/* Waveform */}
        <canvas ref={canvasRef} className={styles.canvas} />

        {/* Big mic button */}
        <div className={`${styles.micBtn} ${isActiveRec ? styles.micActive : ""} ${autoA2TStatus === "processing" ? styles.micProcessing : ""}`}>
          {autoA2TStatus === "processing" ? "⏳" : "🎙"}
        </div>

        {/* Status */}
        <div className={styles.status}>{displayStatus}</div>

        {/* Controls */}
        <div className={styles.controls}>
          <button className={styles.btnStart} onClick={startRecording} disabled={isActiveRec}>
            <span>Start</span>
          </button>
          <button className={styles.btnPause} onClick={togglePause} disabled={!isActiveRec}>
            <span>{pauseLabel}</span>
          </button>
          <button className={styles.btnStop} onClick={stopRecording} disabled={!isActiveRec}>
            <span>Stop</span>
          </button>
        </div>
      </div>
    </div>
  );
}
