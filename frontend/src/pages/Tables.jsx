import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

const STATUS_STYLE = {
  available: "bg-slate-50 border-slate-200 hover:border-slate-900 text-slate-900",
  occupied: "bg-amber-50 border-amber-300 text-amber-900",
  billing: "bg-blue-50 border-blue-300 text-blue-900",
};

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState({});
  const navigate = useNavigate();

  const refresh = async () => {
    const [t, o] = await Promise.all([
      api.get("/tables"),
      api.get("/orders", { params: { channel: "dine-in", limit: 200 } }),
    ]);
    setTables(t.data);
    const byId = {};
    o.data.forEach((or) => { if (or.table_id) byId[or.table_id] = or; });
    setOrders(byId);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-[1600px]" data-testid="tables-page">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Tables</h1>
        <p className="text-slate-500 text-sm mt-1">Floor view · click an occupied table to view its order.</p>
      </div>

      <div className="flex gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-300" />Available</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-amber-200 border border-amber-300" />Occupied</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-blue-200 border border-blue-300" />Billing</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {tables.map((t) => {
          const o = orders[t.id];
          return (
            <button
              key={t.id}
              onClick={() => o ? navigate(`/kot?order=${o.id}`) : navigate("/pos")}
              className={`aspect-square rounded-lg border-2 ${STATUS_STYLE[t.status]} p-3 flex flex-col justify-between transition-colors active:scale-[0.98] text-left`}
              data-testid={`table-${t.number}`}
            >
              <div className="flex items-start justify-between">
                <div className="font-display text-2xl font-bold">T{t.number}</div>
                <div className="flex items-center gap-1 text-xs">
                  <Users className="w-3 h-3" />{t.capacity}
                </div>
              </div>
              <div>
                {o ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{o.order_number}</div>
                    <div className="text-sm font-semibold mt-0.5">₹ {o.total.toFixed(0)}</div>
                  </>
                ) : (
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Available</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
