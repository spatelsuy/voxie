export const ONBOARDING_PAGES = [
  {
    id: "hero",
    type: "hero",
    logo: "🎙",
    title: "Your voice, instantly organised.",
    description:
      "Speak naturally. Kahija listens, transcribes, and turns your words into activities automatically.",
    cta: "Try it now",
  },
  {
    id: "problem",
    type: "problem",
    eyebrow: "Sound familiar?",
    lines: [
      '"I\'ll remember that later..."',
      "Five minutes later — it's gone.",
      "You're driving. Three things just hit you.",
      "Can't type. Can't stop.",
      "Later… you remember only one.",
    ],
  },
  {
    id: "how-it-works",
    type: "steps",
    title: "Three taps. That's all.",
    steps: [
      { number: "1", label: "Tap the circle", detail: "Start recording with one tap." },
      { number: "2", label: "Speak naturally", detail: "Talk like you're thinking out loud. No special commands." },
      { number: "3", label: "Tap to stop", detail: "Kahija transcribes and organises everything instantly." },
    ],
  },
  {
    id: "demo-input",
    type: "demoInput",
    title: "Unstructured speech. Structured execution.",
    label: "What you say",
    text:
      "Tomorrow remind me to call Swa at 10. I have a project review at 3. I also need to buy batteries and printer paper. The team needs updated numbers before the meeting.",
  },
  {
    id: "demo-output",
    type: "demoOutput",
    title: "What Kahija creates",
    items: [
      { icon: "⚡", title: "Activity", detail: "Call Swa — Tomorrow at 10:00 AM" },
      { icon: "⚡", title: "Activity", detail: "Project Review — Tomorrow at 3:00 PM" },
      { icon: "⚡", title: "Activity", detail: "Buy batteries · Buy printer paper" },
      { icon: "📝", title: "Note",     detail: "Team needs updated numbers before the project review." },
    ],
  },
  {
    id: "use-cases",
    type: "useCases",
    title: "Built for when typing slows you down",
    items: ["Driving", "Walking", "Cooking", "Shopping", "Exercising", "Brainstorming", "In a meeting", "Just woke up"],
  },
  {
    id: "privacy",
    type: "privacy",
    title: "Your privacy matters",
    points: [
      "Audio is sent to Whisper for transcription only — it is not stored on any server.",
      "All your tasks, events, and reminders are saved locally on your device.",
      "Sync to Google Drive or Kahija DB is opt-in and under your control.",
    ],
  },
  {
    id: "cta",
    type: "cta",
    title: "No typing. No stopping. No forgotten thoughts.",
    description:
      "Whether you're thinking faster than you can type or simply on the move, Kahija organises your day while you stay in flow.",
    cta: "Start your first recording",
  },
];
