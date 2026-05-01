import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bike, RefreshCw, Plus } from "lucide-react";
import { toast } from "sonner";

const SOURCES = [
  { id: "swiggy", label: "Swiggy", color: "#fc8019", border: "border-l-swiggy", btn: "bg-[#fc8019] hover:bg-[#e87015]" },
  { id: "zomato", label: "Zomato", color: "#e23744", border: "border-l-zomato", btn: "bg-[#e23744] hover:bg-[#c92e3a]" },
];

export default function Aggregators() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");

  const refresh = async () => {
    const { data } = await api.get("/orders", { params: { limit: 200 } });
    setOrders(data.filter((o) => o.channel === "swiggy" || o.channel === "zomato"));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, []);

  const simulate = async (source) => {
    setBusy(source);
    try {
      await api.post("/aggregator/simulate", null, { params: { source } });
      toast.success(`New ${source} order received`);
      refresh();
    } catch {
      toast.error("Could not simulate");
    } finally {
      setBusy("");
    }
  };

  const accept = async (o) => {
    await api.put(`/orders/${o.id}/status`, { status: "preparing" });
    toast.success(`${o.order_number} accepted`);
    refresh();
  };

  const reject = async (o) => {
    await api.put(`/orders/${o.id}/status`, { status: "cancelled" });
    toast(`${o.order_number} rejected`);
    refresh();
  };

  const filtered = filter === "all" ? orders : orders.filter((o) => o.channel === filter);

  return (
    <div className="p-6 space-y-6 max-w-[1600px]" data-testid="aggregators-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Aggregator orders</h1>
          <p className="text-slate-500 text-sm mt-1">Live feed from Swiggy & Zomato (mock + webhook ready)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <Button
              key={s.id}
              onClick={() => simulate(s.id)}
              disabled={busy === s.id}
              className={`${s.btn} text-white`}
              data-testid={`simulate-${s.id}-btn`}
            >
              <Plus className="w-4 h-4 mr-1.5" />Simulate {s.label}
            </Button>
          ))}
          <Button variant="outline" onClick={refresh} data-testid="refresh-btn">
            <RefreshCw className="w-4 h-4 mr-1.5" />Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        {[{ id: "all", label: "All" }, ...SOURCES].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 hover:border-slate-400"
            }`}
            data-testid={`filter-${f.id}`}
          >{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-slate-500">
          <Bike className="w-8 h-8 mx-auto mb-2 text-slate-400" />
          No aggregator orders yet. Click "Simulate" to push a demo order.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((o) => {
          const src = SOURCES.find((s) => s.id === o.channel);
          return (
            <div
              key={o.id}
              className={`bg-white border border-slate-200 border-l-4 ${src.border} rounded-lg p-5 space-y-3 animate-fade-in`}
              data-testid={`agg-card-${o.id}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: src.color }}>{src.label}</span>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">{o.order_number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{o.aggregator_order_id}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-bold">₹ {o.total.toFixed(0)}</div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{o.status}</div>
                </div>
              </div>

              <div className="text-sm">
                <div className="font-medium text-slate-900">{o.customer_name || "Customer"}</div>
                <div className="text-xs text-slate-500">{o.customer_phone}</div>
              </div>

              <ul className="space-y-1 text-sm border-t border-slate-100 pt-3">
                {o.items.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span><span className="font-mono text-slate-500 mr-1">×{it.quantity}</span>{it.name}</span>
                    <span className="font-mono text-slate-600">₹ {(it.price * it.quantity).toFixed(0)}</span>
                  </li>
                ))}
              </ul>

              {o.status === "new" && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" onClick={() => reject(o)} className="border-red-200 text-red-600 hover:bg-red-50" data-testid={`reject-${o.id}`}>
                    Reject
                  </Button>
                  <Button onClick={() => accept(o)} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid={`accept-${o.id}`}>
                    Accept
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
