import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  Leaf,
  Home,
  BarChart2,
  Calendar,
  Settings,
  WifiOff,
  Clock,
} from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { useOfflineStore } from "../stores/offline";
import api from "../lib/api";

export default function Layout() {
  const { logout } = useAuthStore();
  const { isOnline, pendingCount } = useOfflineStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch { /* ignore */ }
    logout();
    navigate("/login");
  };

  const navItems = [
    { to: "/", icon: Home, label: "Plantes", end: true },
    { to: "/calendar", icon: Calendar, label: "Calendrier" },
    { to: "/stats", icon: BarChart2, label: "Stats" },
    { to: "/settings", icon: Settings, label: "Réglages" },
  ];

  return (
    <div className="min-h-screen bg-green-50 dark:bg-gray-900 flex flex-col">
      {/* Top bar */}
      <header className="bg-green-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <Leaf className="w-6 h-6" />
          <span className="font-bold text-lg">PlantCare</span>
        </div>
        <div className="flex items-center gap-3">
          {!isOnline && (
            <div className="flex items-center gap-1 bg-orange-500 rounded-full px-2 py-0.5 text-xs">
              <WifiOff className="w-3 h-3" />
              <span>Hors ligne</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1 bg-yellow-500 text-black rounded-full px-2 py-0.5 text-xs">
              <Clock className="w-3 h-3" />
              <span>{pendingCount} en attente</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-sm opacity-75 hover:opacity-100 transition-opacity"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around py-2 shadow-lg">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors text-xs ${
                isActive
                  ? "text-green-700 dark:text-green-400 font-semibold"
                  : "text-gray-500 dark:text-gray-400"
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
