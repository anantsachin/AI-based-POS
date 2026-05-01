import AIChatPanel from "@/components/AIChatPanel";

export default function AIPage() {
  return (
    <div className="p-6 max-w-4xl space-y-4 h-full flex flex-col" data-testid="ai-page">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">AI Assistant</h1>
        <p className="text-slate-500 text-sm mt-1">Ask Spice anything about your live restaurant data — sales, tables, kitchen, menu, slow movers.</p>
      </div>
      <div className="flex-1 min-h-0">
        <AIChatPanel embedded />
      </div>
    </div>
  );
}
