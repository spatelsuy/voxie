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
    this.autoPauseMs      = options.autoPauseMs      ?? 5000;  // ms of silence → auto-pause both recorders
    // Hysteresis thresholds — prevents oscillation when room noise sits near the boundary.
    // Enter-speech threshold is higher than exit-speech threshold so a single noise spike
    // cannot keep _speaking=true forever when the user has stopped talking.
    // Room noise observed at ~0.04–0.06 RMS (fan/AC/ambient); real speech peaks at ~0.10+ RMS.
    this.speechOnThreshold  = options.speechOnThreshold  ?? 0.10; // RMS must exceed this to START being "speaking"
    this.speechOffThreshold = options.speechOffThreshold ?? 0.03; // was 0.008 — now sits above your normal noise floor (0.005–0.014)
    this.minSpeechMs        = options.minSpeechMs        ?? 200;  // ms of actual voiced frames — must be high enough
                                                                   // to reject room noise that briefly exceeds speechOn
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
    this._speaking      = false;
    this._silenceStart  = null;
    this._speechEndedAt = null;  // set once when _speaking→false; drives auto-pause independently of noise
    this._autoPaused    = false; // true when auto-paused due to long silence
    this.resumeConfirmMs  = options.resumeConfirmMs ?? 300; // ms of sustained sound needed before auto-resume
    this._resumeCandidateStart = null; // tracks how long sound has been sustained since auto-paused
    // Track in-flight fetch promises so stop() can wait for them all
    this._inFlight = new Set();

    // RMS debug logging — logs noise floor every 3s so threshold can be tuned
    this._lastRmsLog    = 0;
    this._maxRmsWindow  = 0;   // peak RMS seen in the last 3s window
    this._lastSilenceLog = -1; // last silence milestone logged (500, 1000…) — prevents spam
  }

  // ─── Public ──────────────────────────────────────────────────────

  async start() {
    if (this.isRecording) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression:  true,  // browser/OS hardware noise filter
        echoCancellation:  true,  // remove speaker feedback
        autoGainControl:   true,  // normalise quiet/loud speech
        // Higher sample rate improves speech clarity in noisy environments
        sampleRate:        16000,
      },
    });

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);

    // ── Create analyser first so nodes can connect to it ────────────
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // ── High-pass filter — cuts low rumble (footsteps, wind, traffic) ─
    // Human speech sits above 85Hz; cutting below 120Hz removes floor
    // vibration, traffic rumble and treadmill/jogging impact noise.
    const highPass = this.audioContext.createBiquadFilter();
    highPass.type            = "highpass";
    highPass.frequency.value = 120;  // Hz
    highPass.Q.value         = 0.7;

    // ── Dynamics compressor — tames sudden loud transients ──────────
    // Compresses kitchen clatter, cutlery, chewing, footstep impact
    // bursts so they don't spike the RMS above the speech threshold.
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;   // dB — compress above this level
    compressor.knee.value      = 10;    // dB — soft knee width
    compressor.ratio.value     = 6;     // 6:1 compression ratio
    compressor.attack.value    = 0.003; // 3ms — fast enough to catch transients
    compressor.release.value   = 0.25;  // 250ms release

    // Chain: mic → highpass → compressor → analyser
    source.connect(highPass);
    highPass.connect(compressor);
    compressor.connect(this.analyser);

    this.segmentCount  = 0;
    this.archiveChunks = [];
    this.isRecording   = true;
    this._speaking      = false;
    this._silenceStart  = null;
    this._speechEndedAt = null;
    this._autoPaused    = false;
    // Ignore RMS spikes for the first 1s — the analyser's smoothingTimeConstant=0.8
    // causes warmup transients that can falsely set _speaking=true and _hadSpeech=true
    // before the user has said anything. 1s covers even slow-settling devices.
    this._warmupUntil  = performance.now() + 1000;

    // Start the archive recorder — runs the whole session
    this._startArchiveRecorder();

    // Start the send recorder — will cut on speech boundaries
    this._startSendRecorder();

    // Start RMS monitor immediately — but _warmupUntil gates the _speaking flag
    this._startRMSMonitor();

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
    this._voicedMs     = 0;      // total milliseconds RMS was above threshold this segment
    this._lastTickTime = performance.now(); // for voiced-duration accumulation
    // Reset silence timer on each new segment — prevents the silence counter
    // carried over from the previous soft-stop from triggering an immediate
    // second soft-stop before the user has had a chance to speak again.
    this._silenceStart   = null;
    this._lastSilenceLog = -1;
    this._resumeCandidateStart = null;

    const rec = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.sendRecorder = rec;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.sendChunks.push(e.data);
    };

    rec.onstop = () => {
      const isFinal   = this._pendingFinal;
      const voicedMs  = Math.round(this._voicedMs);

      console.log(`[Transcriber] 📼 onstop fired — voicedMs=${voicedMs}ms  chunks=${this.sendChunks.length}  isFinal=${isFinal}  minSpeechMs=${this.minSpeechMs}`);

      if (this.sendChunks.length > 0 && voicedMs >= this.minSpeechMs && this._hadSpeech) {
        const blob = new Blob(this.sendChunks, { type: this.mimeType });
        console.log(`[Transcriber] 📤 queuing segment ${this.segmentCount + 1} for backend — ${(blob.size / 1024).toFixed(1)} KB, voicedMs=${voicedMs}ms, isFinal=${isFinal}`);
        this._sendToBackend(blob, isFinal);
      } else {
        console.warn(`[Transcriber] ⚠️ onstop: skipping — voicedMs=${voicedMs}ms (min=${this.minSpeechMs}ms), hadSpeech=${this._hadSpeech}`);
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
      const tickDelta = now - this._lastTickTime;
      this._lastTickTime = now;

      // ── Periodic RMS log every 3s so you can tune silenceThreshold ─
      if (rms > this._maxRmsWindow) this._maxRmsWindow = rms;
      if (now - this._lastRmsLog > 3000) {
        console.log(`[Transcriber] RMS peak last 3s: ${this._maxRmsWindow.toFixed(4)}  on=${this.speechOnThreshold} off=${this.speechOffThreshold}  speaking=${this._speaking}`);
        this._lastRmsLog   = now;
        this._maxRmsWindow = 0;
      }

      // ── Hysteresis: different thresholds to enter vs exit "speaking" ─────
      // If currently NOT speaking: only become speaking if RMS > speechOnThreshold (high bar)
      // If currently speaking:     only start silence timer if RMS < speechOffThreshold (low bar)
      // This prevents room noise (~0.015–0.019) from keeping _speaking=true indefinitely.
      const isSpeechFrame = this._speaking
        ? rms >= this.speechOffThreshold   // already speaking — keep speaking unless really quiet
        : rms >  this.speechOnThreshold;   // not speaking — only flip if clearly above noise floor

      // Replace the strict "continuous" resume check with a rolling accumulation
      if (isSpeechFrame) {
        if (now < this._warmupUntil) {
          this._rafId = requestAnimationFrame(tick);
          return;
        }

        if (this._autoPaused) {
          // Resume immediately — don't wait for confirmation before recording.
          // This avoids losing the first syllables of real speech.
          if (this._resumeCandidateStart === null) {
            console.log("[Transcriber] tentative resume — recording immediately, confirming in background");
            this._resumeCandidateStart = now;
            this._resumeVoicedMs = 0;
            this._autoPaused = false;   // treat as resumed right away
            this._speaking = true;
            this._silenceStart = null;
            this._speechEndedAt = null;
            if (this.sendRecorder?.state    === "paused") this.sendRecorder.resume();
            if (this.archiveRecorder?.state === "paused") this.archiveRecorder.resume();
            this.onAutoResume();
            this.onStatusChange("speaking");
            this._resumeCandidateStart = null;
          }
          this._voicedMs += tickDelta;
          this._hadSpeech = true;
        } else {
          this._voicedMs += tickDelta;
          this._hadSpeech = true;
          this._speaking      = true;
          this._silenceStart  = null;
          this._speechEndedAt = null;
          this.onStatusChange("speaking");
        }
      } else {
        // ── Silence ─────────────────────────────────────────────────
        if (this._autoPaused) {
          // A spike didn't hold — reset the candidate timer
          // this._resumeCandidateStart = null;          
          // Already auto-paused — keep the rAF running to detect voice
          this._rafId = requestAnimationFrame(tick);
          return;
        }

        if (this._silenceStart === null) this._silenceStart = now;
        const silentFor = now - this._silenceStart;
        this.onStatusChange(this._speaking ? "silence" : "idle");

        // ── Log silence progress at 500ms, 1000ms, 1500ms, 2000ms only ──
        const silentForRounded = Math.round(silentFor / 500) * 500;
        if (this._speaking && silentForRounded > 0 && silentForRounded !== this._lastSilenceLog) {
          this._lastSilenceLog = silentForRounded;
          console.log(`[Transcriber] ⏱ silence: ${silentForRounded}ms / ${this.silenceMs}ms`);
        }

        // Threshold 1 — soft stop: transcribe the current segment
        if (this._speaking && silentFor >= this.silenceMs) {
          console.log(`[Transcriber] ✂️ SOFT STOP triggered — silence=${Math.round(silentFor)}ms  sendRecorder.state=${this.sendRecorder?.state}  chunks=${this.sendChunks.length}`);
          this._speaking      = false;
          this._speechEndedAt = now;  // record exactly when speech ended — auto-pause counts from here
          this._softStop();
        }

        // Threshold 2 — auto-pause: counts from when speech ended, NOT from _silenceStart.
        // _silenceStart resets on any noise spike above threshold, making auto-pause inconsistent.
        // _speechEndedAt is only set when a real speech segment ends — noise cannot reset it.
        if (!this._speaking && this._speechEndedAt !== null) {
          const silentSinceSpeech = now - this._speechEndedAt;
          if (silentSinceSpeech >= this.autoPauseMs) {
            console.log(`[Transcriber] auto-pause — ${Math.round(silentSinceSpeech)}ms since last speech`);
            this._autoPaused    = true;
            this._silenceStart  = null;
            this._speechEndedAt = null;
            if (this.sendRecorder?.state    === "recording") this.sendRecorder.pause();
            if (this.archiveRecorder?.state === "recording") this.archiveRecorder.pause();
            this.onAutoPause();
            this.onStatusChange("auto-paused");
          }
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
