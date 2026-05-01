import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp, IndianRupee, Receipt, ShoppingBag, Bike, Utensils,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";

const CHANNEL_COLOR = {
  "dine-in": "#0f172a",
  takeaway: "#16a34a",
  swiggy: "#fc8019",
  zomato: "#e23744",
};

const PAY_COLOR = {
  cash: "#16a34a", upi: "#2563eb", card: "#f59e0b", pending: "#94a3b8",
};

function StatCard({ icon: Icon, label, value, accent, testid }) {
  return (
    <Card className="border-slate-200 shadow-none" data-testid={testid}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">{label}</div>
            <div className="font-display text-3xl font-bold mt-2 text-slate-900">{value}</div>
          </div>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${accent}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    (async () => {
      const [r1, r2] = await Promise.all([
        api.get("/reports/sales", { params: { days: 7 } }),
        api.get("/orders", { params: { limit: 8 } }),
      ]);
      setData(r1.data);
      setOrders(r2.data);
    })();
  }, []);

  if (!data) return <div className="p-6 text-slate-500">Loading…</div>;

  const channelData = data.channel_split.map((c) => ({
    name: c.channel, value: c.revenue, orders: c.orders,
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1600px]" data-testid="dashboard-page">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Last 7 days · all channels</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testid="stat-revenue" icon={IndianRupee} label="Revenue" value={`₹ ${data.total_revenue.toLocaleString("en-IN")}`} accent="bg-slate-900" />
        <StatCard testid="stat-orders" icon={Receipt} label="Orders" value={data.total_orders} accent="bg-blue-600" />
        <StatCard testid="stat-aov" icon={TrendingUp} label="Avg Order" value={`₹ ${data.avg_order_value.toLocaleString("en-IN")}`} accent="bg-emerald-600" />
        <StatCard testid="stat-aggregator" icon={Bike} label="Aggregator Orders"
          value={data.channel_split.filter(c => ["swiggy", "zomato"].includes(c.channel)).reduce((s, c) => s + c.orders, 0)}
          accent="bg-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-slate-200 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-slate-900">Revenue trend</h3>
              <span className="text-xs text-slate-500">Last 7 days</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Line type="monotone" dataKey="revenue" stroke="#0f172a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-5">
            <h3 className="font-display font-semibold mb-4 text-slate-900">Channel split</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={channelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {channelData.map((c) => (
                      <Cell key={c.name} fill={CHANNEL_COLOR[c.name] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-1.5">
              {channelData.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CHANNEL_COLOR[c.name] || "#94a3b8" }} />
                    <span className="capitalize text-slate-600">{c.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">₹ {c.value.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-5">
            <h3 className="font-display font-semibold mb-4 text-slate-900">Top items</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.top_items.slice(0, 6)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" fontSize={11} />
                  <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ borderRadius: 8 }} />
                  <Bar dataKey="qty" fill="#0f172a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-5">
            <h3 className="font-display font-semibold mb-4 text-slate-900">Recent orders</h3>
            <div className="space-y-2">
              {orders.length === 0 && (
                <div className="text-sm text-slate-500 py-8 text-center">No orders yet. Use the POS to create one or simulate aggregator orders.</div>
              )}
              {orders.map((o) => {
                const ch = o.channel;
                const dot =
                  ch === "swiggy" ? "bg-swiggy" :
                  ch === "zomato" ? "bg-zomato" :
                  ch === "takeaway" ? "bg-emerald-600" : "bg-slate-900";
                return (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium font-mono truncate">{o.order_number}</div>
                        <div className="text-xs text-slate-500 capitalize">{ch} · {o.status}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold">₹ {o.total.toLocaleString("en-IN")}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
