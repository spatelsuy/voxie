import { useState } from "react";

const COLORS = {
  ink: "#1B1E2E", mist: "#6B6F85", faint: "#B5AF9C",
  paper: "#ffffff", line: "#EDE6D8", amber: "#E08A2E",
};
const MAX_LEN = 1000;
const FONT = "var(--app-font)";

/** Contact / feedback window. Posts to /api/feedback; the destination email never reaches the browser. */
export default function FeedbackModal({ onClose }) {
  const [message, setMessage] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [website, setWebsite] = useState(""); // honeypot - real users never see or fill this
  const [state, setState]     = useState("idle"); // idle | sending | done | error
  const [error, setError]     = useState("");

  async function handleSend() {
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, replyTo, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Failed (${res.status})`);
      setState("done");
    } catch (err) {
      setError(err.message);
      setState("error");
    }
  }

  const canSend = message.trim().length >= 10 && state !== "sending";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 1,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, background: COLORS.paper, borderRadius: 16,
          padding: 20, fontFamily: FONT, boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: COLORS.ink }}>Contact us</div>
            <div style={{ fontSize: 12.5, color: COLORS.mist, marginTop: 2 }}>
              Questions, ideas or problems — we read every message.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              flex: "none", width: 32, height: 32, minHeight: "unset", padding: 0,
              border: "none", background: "#f1f5f9", borderRadius: 8, cursor: "pointer",
              color: COLORS.mist, fontSize: 14, lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {state === "done" ? (
          <div style={{ padding: "24px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>Thank you!</div>
            <div style={{ fontSize: 13, color: COLORS.mist, marginTop: 6 }}>
              Your message has been sent.{replyTo ? " We'll reply to the email you gave." : ""}
            </div>
            <button onClick={onClose} style={primaryBtn(true)}>Close</button>
          </div>
        ) : (
          <>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
              placeholder="Type your message here…"
              rows={6}
              style={{
                width: "100%", boxSizing: "border-box", padding: 10, fontSize: 14, fontFamily: FONT,
                border: `1px solid ${COLORS.line}`, borderRadius: 10, resize: "vertical", color: COLORS.ink,
              }}
            />
            <div style={{ textAlign: "right", fontSize: 11, color: COLORS.mist, margin: "2px 2px 8px" }}>
              {message.length}/{MAX_LEN}
            </div>

            <input
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="Your email (optional, only if you'd like a reply)"
              autoComplete="email"
              style={{
                width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 13.5, fontFamily: FONT,
                border: `1px solid ${COLORS.line}`, borderRadius: 10, color: COLORS.ink,
              }}
            />

            {/* Honeypot: hidden from people and screen readers, tempting to bots */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />

            {state === "error" && (
              <div style={{ color: "#dc2626", fontSize: 12.5, marginTop: 8 }}>{error}</div>
            )}

            <button onClick={handleSend} disabled={!canSend} style={primaryBtn(canSend)}>
              {state === "sending" ? "Sending…" : "Send"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function primaryBtn(enabled) {
  return {
    marginTop: 12, width: "100%", padding: "11px 16px", border: "none", borderRadius: 10,
    background: COLORS.amber, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: FONT,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.5,
  };
}
