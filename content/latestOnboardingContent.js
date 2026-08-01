export const ONBOARDING_PAGES = [
  {
    id: "hero",
    type: "hero",
    title: "Never lose a thought again.",
    description:
      "Say it the moment it hits you. Kahija listens, transcribes, and turns your words into tasks, reminders, and notes — automatically.",
    cta: "Start talking — it's free",
  },
  {
    id: "problem",
    type: "problem",
    eyebrow: "Sound familiar?",
    lines: [
      "Driving to work — three things hit you at once.",
      "Cooking dinner, hands full — a great idea shows up.",
      "Folding laundry, walking the dog, chasing the kids —",
      "same story, every time.",
      "\u201CI\u2019ll remember it later.\u201D Later never comes.",
      "The good ideas always show up when your hands are busy.",
    ],
  },
  {
    id: "how-it-works",
    type: "steps",
    title: "Three taps. That's all.",
    steps: [
      { number: "1", label: "Tap the circle", detail: "Start recording with one tap." },
      { number: "2", label: "Speak naturally", detail: "Talk like you're thinking out loud. Pause mid-thought — Kahija waits for you." },
      { number: "3", label: "Tap to stop", detail: "Kahija transcribes and organises everything instantly." },
    ],
  },
  {
    id: "demo",
    type: "demo",
    title: "Unstructured speech. Structured execution.",
    input:
      "Tomorrow remind me to call Swa at 10. I have a project review at 3. I also need to buy batteries and printer paper. The team needs updated numbers before the meeting.",
    output: [
      { icon: "activity", title: "Activity", detail: "Call Swa — Tomorrow, 10:00 AM" },
      { icon: "activity", title: "Activity", detail: "Project Review — Tomorrow, 3:00 PM" },
      { icon: "activity", title: "Activity", detail: "Buy batteries · Buy printer paper" },
      { icon: "note", title: "Note", detail: "Team needs updated numbers before the review." },
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