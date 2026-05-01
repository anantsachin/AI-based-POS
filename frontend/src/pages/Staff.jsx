import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Staff() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "waiter" });

  const refresh = async () => {
    const { data } = await api.get("/users");
    setUsers(data);
  };

  useEffect(() => { refresh(); }, []);

  const save = async () => {
    try {
      await api.post("/users", form);
      toast.success("User created");
      setOpen(false);
      setForm({ email: "", name: "", password: "", role: "waiter" });
      refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.name}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px]" data-testid="staff-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Staff</h1>
          <p className="text-slate-500 text-sm mt-1">{users.length} active users</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white" data-testid="add-staff-btn">
          <Plus className="w-4 h-4 mr-1.5" />Add user
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-4 p-4" data-testid={`user-row-${u.id}`}>
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700">
              {u.name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-slate-500">{u.email}</div>
            </div>
            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
              u.role === "admin" ? "bg-slate-900 text-white" : u.role === "cashier" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
            }`}>{u.role}</span>
            <Button size="icon" variant="ghost" onClick={() => remove(u)} className="text-red-500 hover:text-red-700" data-testid={`del-user-${u.id}`}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader><DialogTitle>New user</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="staff-name-input" /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="staff-email-input" /></div>
            <div className="space-y-1.5"><Label>Password</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="staff-password-input" /></div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="staff-role-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="waiter">Waiter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={save} data-testid="save-staff-btn">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
