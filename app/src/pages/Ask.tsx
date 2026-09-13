import { useState } from "react";
import { askQuestion, type ChatTurn } from "../lib/insights";

const SUGGESTIONS = ["How was this month?", "How much did I spend on food?", "Compare this month to last month."];

export function Ask() {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    const history = [...messages, { role: "user", text: trimmed } as ChatTurn];
    setMessages(history);
    setBusy(true);
    try {
      const answer = await askQuestion(trimmed, messages);
      setMessages([...history, { role: "assistant", text: answer }]);
    } catch (err) {
      console.error("askQuestion failed", err);
      setError("Couldn't reach the assistant — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1>Ask</h1>
      <p style={{ marginTop: 0, fontSize: 12, color: "var(--text-muted)" }}>
        Answers are read-only and grounded in your own data — nothing here can change a
        transaction, category, or goal. This conversation isn't saved once you leave the screen.
      </p>

      {messages.length === 0 && (
        <div className="card">
          <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>Try asking:</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="button secondary" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="chat-bubble assistant">…</div>}
      </div>

      {error && (
        <p style={{ color: "var(--status-critical)", fontSize: 13 }}>{error}</p>
      )}

      <div className="chat-input-row">
        <textarea
          rows={2}
          value={input}
          placeholder="Ask about your spending, savings, or a specific month…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button type="button" className="button" disabled={busy || !input.trim()} onClick={() => send(input)}>
          Send
        </button>
      </div>
    </div>
  );
}
