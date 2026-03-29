import { Outlet, NavLink } from "react-router-dom";
import { Home, Leaf, Settings, Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useAppStore } from "../stores/app";
import { useOfflineStore } from "../stores/offline";

export default function Layout() {
  const { gardenName } = useAppStore();
  const { isOnline, isSyncing, pendingCount, lastSyncError } = useOfflineStore();

  const navItems = [
    { to: "/", icon: Home, label: "Plantes", end: true },
    { to: "/settings", icon: Settings, label: "Réglages" },
  ];

  return (
    <div className="min-h-screen bg-green-50 dark:bg-gray-900 flex flex-col">
      <header className="bg-green-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <Leaf className="w-6 h-6 flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-bold text-lg">PlantCare</div>
            <div className="text-xs text-green-100 truncate">{gardenName ?? "Mode local"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${isOnline ? "bg-emerald-500/90" : "bg-orange-500/90"}`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? "En ligne" : "Hors ligne"}</span>
          </div>
          {isSyncing && (
            <div className="flex items-center gap-1 rounded-full bg-blue-500/90 px-2 py-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Sync</span>
            </div>
          )}
          {pendingCount > 0 && (
            <div className="rounded-full bg-yellow-400 px-2 py-1 text-black">{pendingCount} attente</div>
          )}
          {lastSyncError && (
            <div title={lastSyncError} className="rounded-full bg-red-500/90 px-2 py-1">
              <AlertTriangle className="w-3 h-3" />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6">
        <Outlet />
      </main>

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
