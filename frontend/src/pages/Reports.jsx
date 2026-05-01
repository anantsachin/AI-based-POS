import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";

const CHANNEL_COLOR = {
  "dine-in": "#0f172a", takeaway: "#16a34a", swiggy: "#fc8019", zomato: "#e23744",
};
const PAY_COLOR = { cash: "#16a34a", upi: "#2563eb", card: "#f59e0b", pending: "#94a3b8" };

export default function Reports() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/reports/sales", { params: { days } }).then((r) => setData(r.data));
  }, [days]);

  if (!data) return <div className="p-6 text-slate-500">Loading…</div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px]" data-testid="reports-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Performance across channels and payments</p>
        </div>
        <div className="flex gap-2 bg-white border border-slate-200 rounded-md p-1">
          {[1, 7, 30].map((d) => (
            <button
              key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${days === d ? "bg-slate-900 text-white" : "hover:bg-slate-100 text-slate-600"}`}
              data-testid={`days-${d}`}
            >{d === 1 ? "Today" : `${d} days`}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-none"><CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Revenue</div>
          <div className="font-display text-3xl font-bold mt-1">₹ {data.total_revenue.toLocaleString("en-IN")}</div>
        </CardContent></Card>
        <Card className="border-slate-200 shadow-none"><CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Orders</div>
          <div className="font-display text-3xl font-bold mt-1">{data.total_orders}</div>
        </CardContent></Card>
        <Card className="border-slate-200 shadow-none"><CardContent className="p-5">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">Avg Order</div>
          <div className="font-display text-3xl font-bold mt-1">₹ {data.avg_order_value.toLocaleString("en-IN")}</div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200 shadow-none"><CardContent className="p-5">
          <h3 className="font-display font-semibold mb-4">By channel</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.channel_split}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="channel" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {data.channel_split.map((c) => (
                    <Cell key={c.channel} fill={CHANNEL_COLOR[c.channel] || "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>

        <Card className="border-slate-200 shadow-none"><CardContent className="p-5">
          <h3 className="font-display font-semibold mb-4">By payment method</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.payment_split} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={90} label>
                  {data.payment_split.map((p) => <Cell key={p.method} fill={PAY_COLOR[p.method] || "#94a3b8"} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent></Card>
      </div>

      <Card className="border-slate-200 shadow-none"><CardContent className="p-5">
        <h3 className="font-display font-semibold mb-4">Top selling items</h3>
        <div className="space-y-2">
          {data.top_items.length === 0 && <div className="text-sm text-slate-500 text-center py-6">No data yet.</div>}
          {data.top_items.map((it, idx) => (
            <div key={it.name} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center text-xs font-bold font-mono">{idx + 1}</div>
              <div className="flex-1 min-w-0 truncate font-medium">{it.name}</div>
              <div className="text-sm text-slate-600">×{it.qty}</div>
              <div className="text-sm font-semibold w-24 text-right">₹ {it.revenue.toLocaleString("en-IN")}</div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}
