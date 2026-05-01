import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Tables from "@/pages/Tables";
import KOT from "@/pages/KOT";
import Aggregators from "@/pages/Aggregators";
import Menu from "@/pages/Menu";
import Reports from "@/pages/Reports";
import Staff from "@/pages/Staff";
import Settings from "@/pages/Settings";
import { Toaster } from "@/components/ui/sonner";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected><Layout /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pos" element={<POS />} />
            <Route path="/tables" element={<Tables />} />
            <Route path="/kot" element={<KOT />} />
            <Route path="/aggregators" element={<Aggregators />} />
            <Route path="/menu" element={<Protected roles={["admin"]}><Menu /></Protected>} />
            <Route path="/reports" element={<Protected roles={["admin", "cashier"]}><Reports /></Protected>} />
            <Route path="/staff" element={<Protected roles={["admin"]}><Staff /></Protected>} />
            <Route path="/settings" element={<Protected roles={["admin"]}><Settings /></Protected>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  );
}
