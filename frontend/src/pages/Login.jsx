import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Utensils, ChefHat, ShieldCheck, Loader2 } from "lucide-react";

const DEMO_CREDS_RAW = process.env.REACT_APP_DEMO_CREDS || "";
const SHOW_DEMO = process.env.REACT_APP_SHOW_DEMO_LOGIN !== "false" && DEMO_CREDS_RAW.length > 0;

/**
 * REACT_APP_DEMO_CREDS format: "Admin:admin@pos.com:admin123|Cashier:cashier@pos.com:cashier123|..."
 * Hidden in production by setting REACT_APP_SHOW_DEMO_LOGIN=false.
 */
const ICONS = { Admin: ShieldCheck, Cashier: Utensils, Waiter: ChefHat };
const QUICK = DEMO_CREDS_RAW
  .split("|")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const [role, email, password] = entry.split(":");
    return { role, email, password, icon: ICONS[role] || ShieldCheck };
  });

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 grid-bg" data-testid="login-page">
      {/* Left: brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-10 bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white text-slate-900 rounded-md flex items-center justify-center font-bold font-display">
            S
          </div>
          <div className="font-display text-xl font-semibold">SpiceRoute POS</div>
        </div>

        <div className="space-y-6">
          <h1 className="font-display text-5xl font-bold leading-tight">
            Run your restaurant.<br />
            Online or offline.
          </h1>
          <p className="text-slate-300 text-base max-w-md leading-relaxed">
            One terminal for dine-in, takeaway, KOT, billing, and aggregator
            orders from <span className="text-[#fc8019] font-semibold">Swiggy</span> and{" "}
            <span className="text-[#e23744] font-semibold">Zomato</span>.
          </p>
          <div className="flex gap-6 pt-4">
            <div>
              <div className="text-3xl font-display font-bold">12+</div>
              <div className="text-slate-400 text-xs uppercase tracking-wider">Tables managed</div>
            </div>
            <div>
              <div className="text-3xl font-display font-bold">2</div>
              <div className="text-slate-400 text-xs uppercase tracking-wider">Aggregators</div>
            </div>
            <div>
              <div className="text-3xl font-display font-bold">100%</div>
              <div className="text-slate-400 text-xs uppercase tracking-wider">Offline-ready</div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 uppercase tracking-wider">
          v1.0 · Hybrid POS
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="lg:hidden flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 text-white rounded-md flex items-center justify-center font-bold font-display">S</div>
            <div className="font-display text-xl font-semibold">SpiceRoute POS</div>
          </div>

          <div>
            <h2 className="font-display text-3xl font-bold text-slate-900">Sign in</h2>
            <p className="text-slate-500 mt-1">Welcome back. Pick a role to start.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-12" data-testid="login-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password" type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-12" data-testid="login-password-input"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2" data-testid="login-error">
                {error}
              </div>
            )}

            <Button
              type="submit" disabled={loading}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-medium"
              data-testid="login-submit-btn"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
              Quick access (demo)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.role}
                    type="button"
                    onClick={() => { setEmail(q.email); setPassword(q.password); }}
                    className="border border-slate-200 hover:border-slate-900 hover:bg-slate-50 rounded-md p-3 text-left transition-colors tap-target"
                    data-testid={`quick-${q.role.toLowerCase()}-btn`}
                  >
                    <Icon className="w-4 h-4 mb-1 text-slate-700" />
                    <div className="text-sm font-semibold">{q.role}</div>
                    <div className="text-xs text-slate-500 truncate">{q.email}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
