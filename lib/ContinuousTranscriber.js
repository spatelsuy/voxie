/**
 * ContinuousTranscriber — speech-boundary approach
 *
 * HOW IT WORKS:
 *
 *  "Watcher thread" (rAF RMS loop):
 *    Runs at ~60fps alongside the MediaRecorder.
 *    Measures microphone volume every frame.
 *    When it detects silence >= silenceMs after a speech run → soft stop:
 *      stop the send-recorder → blob sent to Whisper → new recorder starts.
 *    User tapping Stop → hard stop:
 *      final blob sent → session ends.
 *
 *  TWO recorders run simultaneously on the same stream:
 *
 *    ┌─ sendRecorder ──────────────────────────────────────────────┐
 *    │  Stops & restarts at every speech pause (soft stop).        │
 *    │  Each resulting blob is speech-only → no hallucinations.    │
 *    │  Each blob is a valid WebM file (fresh header every start). │
 *    └─────────────────────────────────────────────────────────────┘
 *
 *    ┌─ archiveRecorder ───────────────────────────────────────────┐
 *    │  Runs uninterrupted for the entire session.                 │
 *    │  Stopped only on hard stop.                                 │
 *    │  Produces one complete, valid WebM file for saving.        │
 *    └─────────────────────────────────────────────────────────────┘
 */
export class ContinuousTranscriber {
  constructor(options = {}) {
    this.backendUrl       = options.backendUrl       || "/api/transcribe-only";
    this.silenceMs        = options.silenceMs        ?? 2000;  // ms of silence → soft stop (transcribe)
    this.autoPauseMs      = options.autoPauseMs      ?? 10000; // ms of silence → auto-pause both recorders
    this.silenceThreshold = options.silenceThreshold ?? 0.02;  // RMS 0-1 — matches tested HTML value
    this.minSpeechMs      = options.minSpeechMs      ?? 150;   // skip clips shorter than this (lowered from 300)
    this.whisperPrompt    = options.whisperPrompt    ?? "Transcribe the following speech accurately."; // anti-hallucination prompt
    this.mimeType         = options.mimeType         || this._pickMimeType();
    this.userName         = options.userName         || "SunilK";

    // Callbacks
    this.onTranscript   = options.onTranscript   || (() => {});
    this.onError        = options.onError        || ((e) => console.error("[ContinuousTranscriber]", e));
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onAutoPause    = options.onAutoPause    || (() => {}); // called when auto-paused
    this.onAutoResume   = options.onAutoResume   || (() => {}); // called when auto-resumed by voice

    // Send-recorder state (stops/restarts on speech boundaries)
    this.sendRecorder  = null;
    this.sendChunks    = [];
    this.segmentStart  = 0;
    this.segmentCount  = 0;
    this._pendingFinal = false;

    // Archive-recorder state (runs the whole session)
    this.archiveRecorder = null;
    this.archiveChunks   = [];

    // Shared
    this.stream       = null;
    this.audioContext = null;
    this.analyser     = null;
    this.isRecording  = false;
    this._rafId       = null;
    this._onStopped   = null;   // set by VoiceRecorder before stop()

    // RMS / speech tracking
    this._speaking     = false;
    this._silenceStart = null;
    this._autoPaused   = false; // true when auto-paused due to long silence

    // Track in-flight fetch promises so stop() can wait for them all
    this._inFlight = new Set();

    // RMS debug logging — logs noise floor every 3s so threshold can be tuned
    this._lastRmsLog   = 0;
    this._maxRmsWindow = 0; // peak RMS seen in the last 3s window
  }

  // ─── Public ──────────────────────────────────────────────────────

  async start() {
    if (this.isRecording) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
    });

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;  // heavy smoothing — RMS rises smoothly so _speaking fires reliably
    source.connect(this.analyser);

    this.segmentCount  = 0;
    this.archiveChunks = [];
    this.isRecording   = true;
    this._speaking     = false;
    this._silenceStart = null;
    this._autoPaused   = false;

    // Start the archive recorder — runs the whole session
    this._startArchiveRecorder();

    // Start the send recorder — will cut on speech boundaries
    this._startSendRecorder();

    // Delay RMS monitor by 300ms — the analyser's smoothingTimeConstant=0.8
    // causes a brief phantom RMS spike on startup as the buffer warms up from
    // zero. Monitoring too early sets _speaking=true and _hadSpeech=true before
    // the user has said anything, sending a silent blob to the backend.
    setTimeout(() => {
      if (this.isRecording) this._startRMSMonitor();
    }, 300);

    this.onStatusChange("recording");
  }

  /**
   * Manual resume — called when user taps Resume button.
   * Clears the auto-paused flag so voice detection can auto-resume next time too.
   */
  manualResume() {
    if (!this._autoPaused) return;
    this._autoPaused   = false;
    this._speaking     = false;
    this._silenceStart = null;
    // Resume both recorders
    if (this.sendRecorder?.state    === "paused") this.sendRecorder.resume();
    if (this.archiveRecorder?.state === "paused") this.archiveRecorder.resume();
    // Restart the RMS monitor
    this._startRMSMonitor();
    this.onStatusChange("recording");
  }

  /** Hard stop — user tapped the stop button. */
  stop() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }

    // Stop archive recorder — handles both recording and paused states
    const ar = this.archiveRecorder;
    if (ar && ar.state === "paused")    ar.resume(); // must resume before stop
    if (ar && ar.state !== "inactive")  ar.stop();

    // Stop send recorder — sends the last speech segment as isFinal
    const sr = this.sendRecorder;
    if (sr && sr.state === "paused") sr.resume(); // must resume before stop
    if (sr && sr.state === "recording") {
      this._pendingFinal = true;
      sr.stop();
      // _teardownWhenReady fires from onstop after the fetch completes
    } else {
      // sendRecorder already inactive (between soft stops, or nothing recorded)
      this._teardownWhenReady();
    }
  }

  /** Returns the complete session recording as one valid WebM Blob. */
  getFullBlob() {
    return new Blob(this.archiveChunks, { type: this.mimeType });
  }

  /** AnalyserNode for the waveform canvas in VoiceRecorder. */
  getAnalyser() { return this.analyser; }

  // ─── Private ─────────────────────────────────────────────────────

  /** Archive recorder — never stopped until hard stop. */
  _startArchiveRecorder() {
    this.archiveChunks = [];
    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.archiveRecorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.archiveChunks.push(e.data);
    };
    rec.start();
  }

  /** Send recorder — stops/restarts at each speech pause. */
  _startSendRecorder() {
    this.sendChunks    = [];
    this.segmentStart  = performance.now();
    this._pendingFinal = false;
    this._hadSpeech    = false;  // tracks whether voice was detected in this segment
    // Reset silence timer on each new segment — prevents the silence counter
    // carried over from the previous soft-stop from triggering an immediate
    // second soft-stop before the user has had a chance to speak again.
    this._silenceStart = null;

    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.sendRecorder = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.sendChunks.push(e.data);
    };

    rec.onstop = () => {
      const duration = performance.now() - this.segmentStart;
      const isFinal  = this._pendingFinal;

      console.log(`[Transcriber] 📼 onstop fired — duration=${Math.round(duration)}ms  chunks=${this.sendChunks.length}  isFinal=${isFinal}  minSpeechMs=${this.minSpeechMs}`);

      if (this.sendChunks.length > 0 && duration >= this.minSpeechMs && this._hadSpeech) {
        const blob = new Blob(this.sendChunks, { type: this.mimeType });
        console.log(`[Transcriber] 📤 queuing segment ${this.segmentCount + 1} for backend — ${(blob.size / 1024).toFixed(1)} KB, duration=${Math.round(duration)}ms, isFinal=${isFinal}`);
        this._sendToBackend(blob, isFinal);
      } else {
        console.warn(`[Transcriber] ⚠️ onstop: skipping — chunks=${this.sendChunks.length}, duration=${Math.round(duration)}ms (min=${this.minSpeechMs}ms), hadSpeech=${this._hadSpeech}`);
      }

      if (isFinal) {
        // Wait for the fetch we just fired (and any others) before teardown
        this._teardownWhenReady();
      } else if (this.isRecording) {
        this._startSendRecorder();
      }
    };

    rec.start();
  }

  /**
   * Soft stop — called by RMS monitor after speech pause >= silenceMs.
   * Cuts the current send segment and immediately starts a new one.
   */
  _softStop() {
    const state = this.sendRecorder?.state ?? "null";
    if (this.sendRecorder && state === "recording") {
      console.log(`[Transcriber] 🔪 _softStop: calling sendRecorder.stop()  chunks=${this.sendChunks.length}`);
      this.sendRecorder.stop();  // onstop → _startSendRecorder()
    } else {
      console.warn(`[Transcriber] ⚠️ _softStop: sendRecorder not recording (state="${state}") — nothing to cut`);
    }
  }

  _startRMSMonitor() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    const buf = new Uint8Array(this.analyser.fftSize);

    const tick = () => {
      if (!this.isRecording) return;

      this.analyser.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      const now = performance.now();

      // ── Periodic RMS log every 3s so you can tune silenceThreshold ─
      if (rms > this._maxRmsWindow) this._maxRmsWindow = rms;
      if (now - this._lastRmsLog > 3000) {
        //console.log(`[Transcriber] RMS peak last 3s: ${this._maxRmsWindow.toFixed(4)}, threshold: ${this.silenceThreshold}, speaking: ${this._speaking}`);
        this._lastRmsLog   = now;
        this._maxRmsWindow = 0;
      }

      if (rms > this.silenceThreshold) {
        // ── Voice detected ──────────────────────────────────────────
        this._hadSpeech = true;  // mark that this segment contains real speech
        if (this._autoPaused) {
          // Auto-resume: voice came back while in auto-pause state
          console.log("[Transcriber] auto-resume — voice detected");
          this._autoPaused   = false;
          this._speaking     = true;
          this._silenceStart = null;
          if (this.sendRecorder?.state    === "paused") this.sendRecorder.resume();
          if (this.archiveRecorder?.state === "paused") this.archiveRecorder.resume();
          this.onAutoResume();
          this.onStatusChange("speaking");
        } else {
          this._speaking     = true;
          this._silenceStart = null;
          this.onStatusChange("speaking");
        }
      } else {
        // ── Silence ─────────────────────────────────────────────────
        if (this._autoPaused) {
          // Already auto-paused — keep the rAF running to detect voice
          this._rafId = requestAnimationFrame(tick);
          return;
        }

        if (this._silenceStart === null) this._silenceStart = now;
        const silentFor = now - this._silenceStart;
        this.onStatusChange(this._speaking ? "silence" : "idle");

        // ── Every ~500ms, log progress toward the soft-stop threshold ──
        if (this._speaking && silentFor > 0 && Math.round(silentFor) % 500 < 20) {
          console.log(`[Transcriber] ⏱ silence progress: ${Math.round(silentFor)}ms / ${this.silenceMs}ms  speaking=${this._speaking}  sendRecorder.state=${this.sendRecorder?.state}`);
        }

        // Threshold 1 — soft stop: transcribe the current segment
        if (this._speaking && silentFor >= this.silenceMs) {
          console.log(`[Transcriber] ✂️ SOFT STOP triggered — silence=${Math.round(silentFor)}ms  sendRecorder.state=${this.sendRecorder?.state}  chunks=${this.sendChunks.length}`);
          this._speaking = false;
          this._softStop();
          // Don't reset _silenceStart — keep counting for auto-pause
        }

        // Threshold 2 — auto-pause: silence has gone on long enough
        if (!this._speaking && silentFor >= this.autoPauseMs) {
          console.log(`[Transcriber] auto-pause — silence ${Math.round(silentFor)}ms`);
          this._autoPaused   = true;
          this._silenceStart = null;
          if (this.sendRecorder?.state    === "recording") this.sendRecorder.pause();
          if (this.archiveRecorder?.state === "recording") this.archiveRecorder.pause();
          this.onAutoPause();
          this.onStatusChange("auto-paused");
          // rAF keeps running (falls through to next requestAnimationFrame below)
          // so we can detect voice and auto-resume
        }
      }

      this._rafId = requestAnimationFrame(tick);
    };

    this._rafId = requestAnimationFrame(tick);
  }

  _teardownWhenReady() {
    if (this._inFlight.size === 0) {
      this._teardown();
    } else {
      const wait = setInterval(() => {
        if (this._inFlight.size === 0) {
          clearInterval(wait);
          this._teardown();
        }
      }, 100);
    }
  }

  _teardown() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioContext?.close();
    this.onStatusChange("idle");
    if (typeof this._onStopped === "function") this._onStopped();
  }

  _pickMimeType() {
    if (typeof window === "undefined") return "audio/webm";
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "audio/webm";
  }

  _getFormattedDateTime() {
    const d   = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  _sendToBackend(blob, isFinal) {
    // Minimum blob size gate: a real speech blob is always > 3KB.
    // Anything smaller is a near-silent clip that will cause hallucination.
    const MIN_BLOB_BYTES = 3000;
    if (blob.size < MIN_BLOB_BYTES) {
      console.warn(`[Transcriber] 🚫 blob too small (${blob.size} bytes < ${MIN_BLOB_BYTES}) — skipping, likely silence`);
      return;
    }
    console.log(`[Transcriber] 🌐 fetching backend — segment will be #${this.segmentCount + 1}, blob=${(blob.size / 1024).toFixed(1)} KB`);

    this.segmentCount += 1;
    const segmentNum = this.segmentCount;

    // Register this fetch in _inFlight so stop() waits for it
    const promise = (async () => {
      try {
        const ext = this.mimeType.includes("webm") ? "webm"
          : this.mimeType.includes("ogg")          ? "ogg"
          : "mp4";

        const formData = new FormData();
        formData.append("user_name",   this.userName);
        formData.append("client_time", this._getFormattedDateTime());
        formData.append("file", blob, `chunk.${ext}`);
        // Whisper prompt: primes the model with context to suppress hallucination
        if (this.whisperPrompt) {
          formData.append("initial_prompt", this.whisperPrompt);
        }

        const res = await fetch(this.backendUrl, { method: "POST", body: formData });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const result = await res.json();
        console.log(`[Transcriber] ✅ segment ${segmentNum} response:`, result);
        console.log(`[Transcriber] ✅ transcription: "${(result.transcription || "").slice(0, 120)}"`);
        this.onTranscript({
          segment:       segmentNum,
          isFinal:       !!isFinal,
          transcription: (result.transcription || "").trim(),
        });
      } catch (err) {
        console.error(`[Transcriber] ❌ segment ${segmentNum} fetch failed:`, err);
        this.onError(err);
      } finally {
        this._inFlight.delete(promise);
      }
    })();

    this._inFlight.add(promise);
  }
}
