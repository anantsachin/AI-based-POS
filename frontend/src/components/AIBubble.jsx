import { useState } from "react";
import { Sparkles } from "lucide-react";
import AIChatPanel from "@/components/AIChatPanel";

export default function AIBubble() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-6 z-40 flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full pl-4 pr-5 py-3 shadow-lg active:scale-95 transition-transform"
          data-testid="ai-bubble-open"
        >
          <Sparkles className="w-4 h-4" />
          <span className="font-semibold text-sm">Ask Spice</span>
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-20 right-6 z-40 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] rounded-xl border border-slate-200 shadow-2xl bg-white overflow-hidden animate-fade-in"
          data-testid="ai-bubble-panel"
        >
          <AIChatPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
