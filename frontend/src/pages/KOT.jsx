import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bike, Clock, Utensils } from "lucide-react";
import { toast } from "sonner";

const STAGES = [
  { id: "new", label: "New", next: "preparing" },
  { id: "preparing", label: "Preparing", next: "ready" },
  { id: "ready", label: "Ready", next: "served" },
];

const channelDot = (ch) =>
  ch === "swiggy" ? "border-l-swiggy" :
  ch === "zomato" ? "border-l-zomato" :
  ch === "takeaway" ? "border-l-emerald-500" :
  "border-l-slate-900";

const channelLabel = (ch) => ch.charAt(0).toUpperCase() + ch.slice(1);

export default function KOT() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data } = await api.get("/orders", { params: { limit: 200 } });
    setOrders(data.filter((o) => ["new", "preparing", "ready"].includes(o.status)));
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const advance = async (o) => {
    const stage = STAGES.find((s) => s.id === o.status);
    if (!stage) return;
    let next = stage.next;
    if (stage.id === "ready" && (o.channel === "swiggy" || o.channel === "zomato")) {
      next = "dispatched";
    }
    try {
      await api.put(`/orders/${o.id}/status`, { status: next });
      toast.success(`Marked ${next}`);
      refresh();
    } catch {
      toast.error("Failed to update");
    }
  };

  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="p-6 space-y-4 max-w-[1600px]" data-testid="kot-page">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Kitchen Display (KOT)</h1>
        <p className="text-slate-500 text-sm mt-1">Live · auto-refresh every 5s</p>
      </div>

      {orders.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">
          No active tickets. Send orders from POS or simulate Swiggy/Zomato to see them here.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {orders.map((o) => (
          <div
            key={o.id}
            className={`bg-white border border-slate-200 border-l-4 ${channelDot(o.channel)} rounded-lg p-4 space-y-3 animate-fade-in`}
            data-testid={`kot-card-${o.id}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono font-semibold text-slate-900">{o.order_number}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                  o.channel === "swiggy" ? "bg-orange-100 text-[#fc8019]"
                  : o.channel === "zomato" ? "bg-red-100 text-[#e23744]"
                  : o.channel === "takeaway" ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-700"
                }`}
              >
                {o.channel === "swiggy" || o.channel === "zomato" ? <Bike className="w-3 h-3 inline mr-1" /> : <Utensils className="w-3 h-3 inline mr-1" />}
                {channelLabel(o.channel)}
              </span>
            </div>

            {o.table_id && (
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-700">Dine-in</div>
            )}
            {(o.customer_name || o.customer_phone) && (
              <div className="text-xs text-slate-600">
                {o.customer_name} {o.customer_phone && `· ${o.customer_phone}`}
              </div>
            )}

            <ul className="space-y-1.5 text-sm">
              {o.items.map((it, idx) => (
                <li key={idx} className="flex items-baseline justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-slate-500 mr-2">×{it.quantity}</span>
                    <span className="font-medium text-slate-900">{it.name}</span>
                    {it.notes && <div className="text-xs text-amber-700 mt-0.5">↳ {it.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className={`text-xs font-bold uppercase tracking-wider ${
                o.status === "new" ? "text-blue-600" :
                o.status === "preparing" ? "text-amber-600" :
                "text-emerald-600"
              }`}>{o.status}</span>
              <Button onClick={() => advance(o)} size="sm" className="bg-slate-900 hover:bg-slate-800 text-white" data-testid={`kot-advance-${o.id}`}>
                Mark {STAGES.find((s) => s.id === o.status)?.next === "served" && (o.channel === "swiggy" || o.channel === "zomato") ? "dispatched" : STAGES.find((s) => s.id === o.status)?.next}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
