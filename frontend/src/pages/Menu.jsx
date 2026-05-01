import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Menu() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    const [c, m] = await Promise.all([api.get("/categories"), api.get("/menu-items")]);
    setCategories(c.data);
    setItems(m.data);
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    const body = {
      name: editing.name,
      category_id: editing.category_id,
      price: parseFloat(editing.price),
      image_url: editing.image_url || "",
      available: !!editing.available,
      tax_rate: parseFloat(editing.tax_rate || 5),
    };
    try {
      if (editing.id) await api.put(`/menu-items/${editing.id}`, body);
      else await api.post("/menu-items", body);
      toast.success("Saved");
      setOpen(false); setEditing(null); refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (it) => {
    if (!window.confirm(`Delete "${it.name}"?`)) return;
    await api.delete(`/menu-items/${it.id}`);
    toast.success("Deleted");
    refresh();
  };

  const toggle = async (it) => {
    await api.put(`/menu-items/${it.id}`, { ...it, available: !it.available });
    refresh();
  };

  const addCategory = async () => {
    const name = window.prompt("Category name?");
    if (!name) return;
    await api.post("/categories", { name, sort_order: categories.length + 1 });
    refresh();
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px]" data-testid="menu-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Menu</h1>
          <p className="text-slate-500 text-sm mt-1">{items.length} items across {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addCategory} data-testid="add-category-btn"><Plus className="w-4 h-4 mr-1.5" />Category</Button>
          <Button
            onClick={() => { setEditing({ name: "", category_id: categories[0]?.id || "", price: "", image_url: "", available: true, tax_rate: 5 }); setOpen(true); }}
            className="bg-slate-900 hover:bg-slate-800 text-white"
            data-testid="add-item-btn"
          ><Plus className="w-4 h-4 mr-1.5" />New item</Button>
        </div>
      </div>

      <div className="space-y-6">
        {categories.map((c) => {
          const list = items.filter((i) => i.category_id === c.id);
          return (
            <div key={c.id}>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-display text-xl font-semibold">{c.name}</h3>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{list.length} items</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                {list.length === 0 && <div className="p-6 text-sm text-slate-400 text-center">No items in this category.</div>}
                {list.map((it) => (
                  <div key={it.id} className="flex items-center gap-4 p-3" data-testid={`menu-row-${it.id}`}>
                    <div className="w-12 h-12 rounded-md bg-slate-100 overflow-hidden flex-shrink-0">
                      {it.image_url && <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-900">{it.name}</div>
                      <div className="text-xs text-slate-500">₹ {it.price} · GST {it.tax_rate}%</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={it.available} onCheckedChange={() => toggle(it)} data-testid={`toggle-${it.id}`} />
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(it); setOpen(true); }} data-testid={`edit-${it.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(it)} className="text-red-500 hover:text-red-700" data-testid={`del-${it.id}`}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="item-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="item-name-input" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editing.category_id} onValueChange={(v) => setEditing({ ...editing, category_id: v })}>
                    <SelectTrigger data-testid="item-cat-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Price (₹)</Label>
                  <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} data-testid="item-price-input" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Image URL</Label>
                <Input value={editing.image_url} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} placeholder="https://…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>GST %</Label>
                  <Input type="number" value={editing.tax_rate} onChange={(e) => setEditing({ ...editing, tax_rate: e.target.value })} />
                </div>
                <div className="space-y-1.5 flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={editing.available} onCheckedChange={(v) => setEditing({ ...editing, available: v })} />
                    Available
                  </label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={save} data-testid="save-item-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
