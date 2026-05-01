import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, Loader2, X, Bot, FileText } from "lucide-react";
import { toast } from "sonner";

const SUGGESTIONS = [
  "What is today's revenue from Swiggy?",
  "Which tables are occupied right now?",
  "Top 5 selling items this week",
  "What slow-moving items should I discount?",
];

/** Reusable chat panel — used in both floating bubble and the dedicated AI page. */
export default function AIChatPanel({ embedded = false, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: "user", text: msg }]);
    setLoading(true);
    try {
      const { data } = await api.post("/ai/chat", { message: msg, session_id: sessionId });
      if (!sessionId) setSessionId(data.session_id);
      setMessages((p) => [...p, { id: data.message_id || `a-${Date.now()}`, role: "assistant", text: data.reply }]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI is unavailable");
      setMessages((p) => [...p, { id: `e-${Date.now()}`, role: "assistant", text: "Sorry, I couldn't reach the AI service. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const summarize = async () => {
    setSummarizing(true);
    try {
      const { data } = await api.post("/ai/summary");
      setMessages((p) => [
        ...p,
        { id: `u-${Date.now()}`, role: "user", text: "Generate end-of-day summary" },
        { id: `a-${Date.now()}`, role: "assistant", text: data.summary },
      ]);
    } catch (e) {
      toast.error("Could not generate summary");
    } finally { setSummarizing(false); }
  };

  return (
    <div className={`flex flex-col bg-white ${embedded ? "h-full rounded-lg border border-slate-200" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="font-display font-semibold text-sm leading-none">Spice AI</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Claude · live data</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={summarize}
            disabled={summarizing}
            className="text-xs font-semibold inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700"
            data-testid="ai-summary-btn"
            title="End-of-day summary"
          >
            {summarizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            EoD summary
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500" data-testid="ai-close-btn">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin">
        {messages.length === 0 && !loading && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex-shrink-0 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="bg-slate-50 rounded-lg px-3.5 py-2.5 text-sm text-slate-700 max-w-[85%]">
                Hi! I'm Spice — ask me anything about your sales, tables, kitchen, or menu.
              </div>
            </div>
            <div className="grid gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-left text-sm px-3 py-2 border border-slate-200 hover:border-slate-900 hover:bg-slate-50 rounded-md transition-colors"
                  data-testid={`ai-suggestion-${SUGGESTIONS.indexOf(s)}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id} className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`} data-testid={`ai-msg-${m.role}-${i}`}>
            <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${
              m.role === "user" ? "bg-slate-200 text-slate-700" : "bg-slate-900 text-white"
            }`}>
              {m.role === "user" ? "You" : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
              m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-800"
            }`}>
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="bg-slate-50 rounded-lg px-3.5 py-2.5 text-sm text-slate-500 inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Spice anything…"
            disabled={loading}
            className="h-11"
            data-testid="ai-input"
          />
          <Button
            type="submit" disabled={loading || !input.trim()}
            className="h-11 bg-slate-900 hover:bg-slate-800 text-white px-4"
            data-testid="ai-send-btn"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
