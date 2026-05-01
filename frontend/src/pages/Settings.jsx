import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function Settings() {
  const [s, setS] = useState(null);

  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data));
  }, []);

  if (!s) return <div className="p-6 text-slate-500">Loading…</div>;

  const save = async () => {
    try {
      await api.put("/settings", {
        restaurant_name: s.restaurant_name, address: s.address, phone: s.phone,
        tax_rate: parseFloat(s.tax_rate), service_charge: parseFloat(s.service_charge),
        currency: s.currency, currency_symbol: s.currency_symbol,
      });
      toast.success("Settings saved");
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Restaurant profile, taxes & receipt info</p>
      </div>

      <Card className="border-slate-200 shadow-none"><CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2"><Label>Restaurant name</Label>
            <Input value={s.restaurant_name} onChange={(e) => setS({ ...s, restaurant_name: e.target.value })} data-testid="set-name" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label>
            <Input value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} data-testid="set-address" /></div>
          <div className="space-y-1.5"><Label>Phone</Label>
            <Input value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} data-testid="set-phone" /></div>
          <div className="space-y-1.5"><Label>Currency symbol</Label>
            <Input value={s.currency_symbol} onChange={(e) => setS({ ...s, currency_symbol: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tax rate (%)</Label>
            <Input type="number" value={s.tax_rate} onChange={(e) => setS({ ...s, tax_rate: e.target.value })} data-testid="set-tax" /></div>
          <div className="space-y-1.5"><Label>Service charge (%)</Label>
            <Input type="number" value={s.service_charge} onChange={(e) => setS({ ...s, service_charge: e.target.value })} /></div>
        </div>
        <div className="pt-2"><Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={save} data-testid="save-settings-btn">Save</Button></div>
      </CardContent></Card>

      <Card className="border-slate-200 shadow-none"><CardContent className="p-6 space-y-2">
        <h3 className="font-display font-semibold">Aggregator webhooks</h3>
        <p className="text-sm text-slate-500">Configure these endpoints in your Swiggy/Zomato partner dashboards. Replace base URL with your production domain.</p>
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 font-mono text-xs space-y-1.5">
          <div>POST <span className="text-emerald-700">/api/aggregator/webhook/swiggy</span></div>
          <div>POST <span className="text-emerald-700">/api/aggregator/webhook/zomato</span></div>
        </div>
      </CardContent></Card>
    </div>
  );
}
