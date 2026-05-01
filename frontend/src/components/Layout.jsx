import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Receipt, LayoutGrid, ChefHat, Bike,
  UtensilsCrossed, BarChart3, Users, Settings as Cog,
  LogOut, Wifi, WifiOff, RefreshCw, Sparkles,
} from "lucide-react";
import { isOnline, getQueue, syncQueue } from "@/lib/offline";
import api from "@/lib/api";
import { toast } from "sonner";
import AIBubble from "@/components/AIBubble";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, roles: ["admin", "cashier", "waiter"] },
  { to: "/pos", label: "POS / Billing", icon: Receipt, roles: ["admin", "cashier", "waiter"] },
  { to: "/tables", label: "Tables", icon: LayoutGrid, roles: ["admin", "cashier", "waiter"] },
  { to: "/kot", label: "Kitchen (KOT)", icon: ChefHat, roles: ["admin", "cashier", "waiter"] },
  { to: "/aggregators", label: "Aggregators", icon: Bike, roles: ["admin", "cashier", "waiter"] },
  { to: "/ai", label: "AI Assistant", icon: Sparkles, roles: ["admin", "cashier", "waiter"] },
  { to: "/menu", label: "Menu", icon: UtensilsCrossed, roles: ["admin"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "cashier"] },
  { to: "/staff", label: "Staff", icon: Users, roles: ["admin"] },
  { to: "/settings", label: "Settings", icon: Cog, roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [online, setOnline] = useState(isOnline());
  const [queueCount, setQueueCount] = useState(getQueue().length);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const refresh = () => setQueueCount(getQueue().length);
    const goOnline = async () => {
      setOnline(true);
      refresh();
      await handleSync(true);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("storage", refresh);
    const id = setInterval(refresh, 2000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("storage", refresh);
      clearInterval(id);
    };
  }, []);

  const handleSync = async (silent = false) => {
    if (getQueue().length === 0) {
      if (!silent) toast("No pending offline orders");
      return;
    }
    setSyncing(true);
    try {
      const res = await syncQueue(api);
      setQueueCount(0);
      toast.success(`Synced ${res.created.length} order(s)`);
    } catch {
      toast.error("Sync failed. Will retry when online.");
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const allowed = NAV.filter((n) => n.roles.includes(user?.role));

  return (
    <div className="flex h-screen bg-slate-50" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-900 text-white rounded-md flex items-center justify-center font-bold font-display">S</div>
          <div>
            <div className="font-display font-semibold text-slate-900 leading-none">SpiceRoute</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">POS Terminal</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 scrollbar-thin">
          {allowed.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to} to={n.to} end={n.end}
                data-testid={`nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white font-medium"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
              {user?.name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">{user?.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-slate-100 rounded-md text-slate-600"
              data-testid="logout-btn"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="text-sm text-slate-500">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>

          <div className="flex items-center gap-3">
            {queueCount > 0 && (
              <button
                onClick={() => handleSync(false)}
                disabled={!online || syncing}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold hover:bg-amber-100 disabled:opacity-50"
                data-testid="sync-queue-btn"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                {queueCount} pending · Sync
              </button>
            )}
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold ${
                online
                  ? "bg-green-50 border border-green-200 text-green-700"
                  : "bg-slate-100 border border-slate-300 text-slate-700"
              }`}
              data-testid="online-status-badge"
            >
              {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {online ? "Online" : "Offline"}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <AIBubble />
    </div>
  );
}
