# Voice Recorder — React / Next.js

A voice recorder web app built with **Next.js 14** and **React 18**, ready to deploy to **Vercel** with zero configuration.

## Features

- 🎙️ Record audio with waveform visualisation
- ⏸ Pause / Resume (manual + auto-pause on silence)
- 🔇 Auto-pause after 10 seconds of silence, auto-resume when you speak
- 💾 Recordings persist in **IndexedDB** (survive page refresh & screen lock)
- 📦 Storage usage warning banner (50 MB warn / 200 MB critical)
- 🤖 **A2T** — sends the first recording to the transcription API and renders a structured day-planner view

## Project structure

```
voice-recorder-app/
├── components/
│   ├── VoiceRecorder.jsx   # recorder, waveform, silence detection, history
│   └── ResponseDisplay.jsx # A2T planner result view
├── pages/
│   ├── _app.js             # global CSS import
│   └── index.js            # page root
├── styles/
│   ├── globals.css         # CSS variables, element resets (applied globally)
│   ├── main.module.css     # scoped styles for VoiceRecorder + page layout
│   └── response.module.css # scoped styles for ResponseDisplay
├── next.config.js
└── package.json
```

## Local development

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a GitHub repository (make sure `node_modules/` is excluded via `.gitignore`).
2. Go to [vercel.com](https://vercel.com) → **New Project** → import the repo.
3. Vercel auto-detects Next.js — hit **Deploy**. No extra configuration needed.

## Configuration

| Constant | File | Default | Description |
|---|---|---|---|
| `SILENCE_TIMEOUT_MS` | `VoiceRecorder.jsx` | `10 000` ms | Silence duration before auto-pause |
| `SILENCE_THRESHOLD` | `VoiceRecorder.jsx` | `5` | RMS level (0–128) below which audio counts as silence |
| `WARN_MB` | `VoiceRecorder.jsx` | `50` | Storage warning threshold |
| `CRITICAL_MB` | `VoiceRecorder.jsx` | `200` | Storage critical threshold |
| API URL | `VoiceRecorder.jsx` | `https://decode-cri.vercel.app/a2t/transcribe` | A2T endpoint |
