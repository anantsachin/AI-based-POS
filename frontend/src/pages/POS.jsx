import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Minus, Trash2, X, ShoppingBag, Utensils, Bike, CreditCard } from "lucide-react";
import { isOnline, addToQueue } from "@/lib/offline";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function POS() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeCat, setActiveCat] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [channel, setChannel] = useState("dine-in");
  const [tableId, setTableId] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, m, t] = await Promise.all([
        api.get("/categories"),
        api.get("/menu-items"),
        api.get("/tables"),
      ]);
      setCategories(c.data);
      setItems(m.data);
      setTables(t.data);
    })();
  }, []); // mount-only: load menu/tables once

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (!it.available) return false;
      if (activeCat !== "all" && it.category_id !== activeCat) return false;
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, activeCat, search]);

  const addItem = (it) => {
    setCart((p) => {
      const idx = p.findIndex((c) => c.menu_item_id === it.id);
      if (idx >= 0) {
        const copy = [...p];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...p, { menu_item_id: it.id, name: it.name, price: it.price, quantity: 1, notes: "" }];
    });
  };

  const updateQty = (id, delta) => {
    setCart((p) =>
      p.map((c) => (c.menu_item_id === id ? { ...c, quantity: Math.max(1, c.quantity + delta) } : c))
    );
  };

  const removeItem = (id) => setCart((p) => p.filter((c) => c.menu_item_id !== id));

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const tax = +(subtotal * 0.05).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);

  const placeOrder = async (paid = false, method = null) => {
    if (cart.length === 0) return toast.error("Cart is empty");
    if (channel === "dine-in" && !tableId) return toast.error("Select a table for dine-in");

    const payload = {
      channel, table_id: channel === "dine-in" ? tableId : null,
      customer_name: customer.name, customer_phone: customer.phone,
      items: cart, notes: "",
    };

    setSubmitting(true);
    try {
      if (!isOnline()) {
        const saved = addToQueue(payload);
        toast.success(`Saved offline · ${saved.client_id.slice(-6)}`);
        resetCart();
        return;
      }
      const { data } = await api.post("/orders", payload);
      if (paid && method) {
        await api.post(`/orders/${data.id}/payment`, {
          payment_method: method, amount_paid: data.total,
        });
        toast.success(`Order ${data.order_number} · paid via ${method}`);
      } else {
        toast.success(`Order ${data.order_number} sent to kitchen`);
      }
      resetCart();
      // refresh tables
      const t = await api.get("/tables");
      setTables(t.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to place order");
    } finally {
      setSubmitting(false);
      setPayOpen(false);
    }
  };

  const resetCart = () => {
    setCart([]); setCustomer({ name: "", phone: "" }); setTableId("");
  };

  return (
    <div className="grid grid-cols-12 gap-4 p-4 md:p-6 h-full" data-testid="pos-page">
      {/* Menu side */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 min-h-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search menu…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11" data-testid="pos-search-input"
            />
          </div>
          <Tabs value={channel} onValueChange={setChannel}>
            <TabsList className="h-11">
              <TabsTrigger value="dine-in" data-testid="ch-dine-in"><Utensils className="w-3.5 h-3.5 mr-1.5" />Dine-in</TabsTrigger>
              <TabsTrigger value="takeaway" data-testid="ch-takeaway"><ShoppingBag className="w-3.5 h-3.5 mr-1.5" />Takeaway</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => setActiveCat("all")}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeCat === "all" ? "bg-slate-900 text-white" : "bg-white border border-slate-200 hover:border-slate-400 text-slate-700"}`}
            data-testid="cat-all"
          >All items</button>
          {categories.map((c) => (
            <button
              key={c.id} onClick={() => setActiveCat(c.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeCat === c.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 hover:border-slate-400 text-slate-700"}`}
              data-testid={`cat-${c.name.toLowerCase()}`}
            >{c.name}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 pr-1 scrollbar-thin pb-2">
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-12 text-sm">No items match your search.</div>
          )}
          {filtered.map((it) => (
            <button
              key={it.id} onClick={() => addItem(it)}
              className="bg-white border border-slate-200 hover:border-slate-900 rounded-lg overflow-hidden text-left transition-colors active:scale-[0.98] tap-target group"
              data-testid={`menu-item-${it.id}`}
            >
              <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                {it.image_url ? (
                  <img src={it.image_url} alt={it.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Utensils className="w-8 h-8" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-sm text-slate-900 line-clamp-1">{it.name}</div>
                <div className="font-display font-semibold text-slate-900 mt-1">₹ {it.price}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart side */}
      <aside className="col-span-12 lg:col-span-4 bg-white border border-slate-200 rounded-lg flex flex-col min-h-0" data-testid="pos-cart">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="font-display font-semibold">Current order</div>
          {cart.length > 0 && (
            <button onClick={resetCart} className="text-xs text-slate-500 hover:text-red-600" data-testid="cart-clear-btn">
              Clear
            </button>
          )}
        </div>

        <div className="p-4 border-b border-slate-200 space-y-3">
          {channel === "dine-in" ? (
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger className="h-11" data-testid="cart-table-select">
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((t) => (
                  <SelectItem key={t.id} value={t.id} disabled={t.status !== "available"}>
                    Table {t.number} · {t.capacity} seats {t.status !== "available" ? `(${t.status})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="h-11" data-testid="cart-customer-name" />
              <Input placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="h-11" data-testid="cart-customer-phone" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin">
          {cart.length === 0 && (
            <div className="text-center text-slate-400 py-12 text-sm">Tap items on the left to add them here.</div>
          )}
          {cart.map((c) => (
            <div key={c.menu_item_id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-slate-500">₹ {c.price} each</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(c.menu_item_id, -1)} className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center hover:border-slate-900" data-testid={`qty-dec-${c.menu_item_id}`}>
                  <Minus className="w-3 h-3" />
                </button>
                <div className="w-7 text-center text-sm font-medium font-mono">{c.quantity}</div>
                <button onClick={() => updateQty(c.menu_item_id, 1)} className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center hover:border-slate-900" data-testid={`qty-inc-${c.menu_item_id}`}>
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <button onClick={() => removeItem(c.menu_item_id)} className="w-7 h-7 text-slate-400 hover:text-red-600 flex items-center justify-center" data-testid={`remove-${c.menu_item_id}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-mono">₹ {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-slate-600"><span>Tax (5%)</span><span className="font-mono">₹ {tax.toFixed(2)}</span></div>
            <div className="flex justify-between text-base font-semibold pt-1 border-t border-slate-100">
              <span>Total</span><span className="font-mono">₹ {total.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => placeOrder(false)}
              variant="outline" disabled={submitting || cart.length === 0}
              className="h-12 border-slate-300 hover:bg-slate-50"
              data-testid="send-kitchen-btn"
            >Send to kitchen</Button>
            <Button
              onClick={() => setPayOpen(true)}
              disabled={submitting || cart.length === 0}
              className="h-12 bg-slate-900 hover:bg-slate-800 text-white"
              data-testid="pay-btn"
            >
              <CreditCard className="w-4 h-4 mr-1.5" />Pay & close
            </Button>
          </div>
        </div>
      </aside>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent data-testid="payment-dialog">
          <DialogHeader>
            <DialogTitle>Take payment · ₹ {total.toFixed(2)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 my-4">
            {["cash", "upi", "card"].map((m) => (
              <button
                key={m} onClick={() => setPayMethod(m)}
                className={`p-4 rounded-md border text-sm font-semibold uppercase tracking-wider transition-colors ${payMethod === m ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 hover:border-slate-900"}`}
                data-testid={`pay-method-${m}`}
              >{m}</button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => placeOrder(true, payMethod)} disabled={submitting} data-testid="confirm-payment-btn">
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
