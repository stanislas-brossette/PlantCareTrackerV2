import { Outlet, NavLink } from "react-router-dom";
import { useRef, useState } from "react";
import { Home, Settings, Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { triggerLightHaptic, triggerSuccessHaptic } from "../lib/haptics";
import { useAppStore } from "../stores/app";
import { useOfflineStore } from "../stores/offline";
import { runFullResync } from "../lib/sync";

export default function Layout() {
  const { gardenName } = useAppStore();
  const { isOnline, isSyncing, pendingCount, lastSyncError, setSyncing, setLastSyncError, setOnline } =
    useOfflineStore();
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const isPulling = useRef(false);
  const pullThreshold = 72;
  const pullProgress = Math.min(pullDistance / pullThreshold, 1);

  const navItems = [
    { to: "/", icon: Home, label: "Plantes", end: true },
    { to: "/settings", icon: Settings, label: "Réglages" },
  ];

  const handleRefresh = async () => {
    setSyncing(true);
    try {
      const result = await runFullResync();
      setOnline(true);
      setLastSyncError(null);
      if (result.queued.success > 0) {
        triggerSuccessHaptic();
        toast.success(`${result.queued.success} action(s) synchronisée(s)`);
      } else {
        triggerSuccessHaptic();
        toast.success("Synchronisation terminée");
      }
      if (result.queued.failed > 0) {
        setLastSyncError(`${result.queued.failed} action(s) en échec`);
        toast.error(`${result.queued.failed} action(s) non synchronisée(s)`);
      }
    } catch {
      setOnline(false);
      setLastSyncError("Serveur Raspberry Pi inaccessible");
      toast.error("Serveur inaccessible");
    } finally {
      setSyncing(false);
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (window.scrollY > 0) return;
    touchStartY.current = event.touches[0]?.clientY ?? null;
    isPulling.current = true;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    if (!isPulling.current || touchStartY.current === null) return;
    if (window.scrollY > 0) {
      setPullDistance(0);
      return;
    }

    const currentY = event.touches[0]?.clientY ?? 0;
    const delta = currentY - touchStartY.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    setPullDistance(Math.min(delta * 0.5, 88));
  };

  const handleTouchEnd = async () => {
    isPulling.current = false;
    touchStartY.current = null;
    const shouldRefresh = pullDistance >= pullThreshold && !isSyncing;
    setPullDistance(0);
    if (shouldRefresh) {
      triggerLightHaptic();
      await handleRefresh();
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-slate-950 flex flex-col">
      <header
        className="bg-[#065f55] text-white px-4 pb-3 flex items-center justify-between shadow-md"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <img
            src="/icons/logo-mark.png"
            alt="PlantCareTrackerV2"
            className="h-9 w-9 flex-shrink-0 rounded-xl object-cover ring-1 ring-white/20"
          />
          <div className="min-w-0">
            <div className="font-bold text-lg">PlantCareTrackerV2</div>
            <div className="text-xs text-emerald-100/85 truncate">{gardenName ?? "Mode local"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${isOnline ? "bg-emerald-400/95 text-[#06342f]" : "bg-amber-400/95 text-[#4a2d00]"}`}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? "En ligne" : "Hors ligne"}</span>
          </div>
          {isSyncing && (
            <div className="flex items-center gap-1 rounded-full bg-amber-300/95 px-2 py-1 text-[#053c35]">
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

      <div className="relative h-1 overflow-hidden bg-[#05433b]/20 dark:bg-black/20">
        <div
          className={`absolute inset-y-0 left-0 rounded-r-full bg-gradient-to-r from-amber-300 via-lime-200 to-emerald-300 dark:from-amber-300 dark:via-lime-300 dark:to-emerald-300 ${isSyncing ? "sync-bar-active" : ""}`}
          style={{
            width: isSyncing ? "34%" : "0%",
            opacity: isSyncing ? 1 : 0,
          }}
        />
      </div>

      <main
        className="relative flex-1 container mx-auto max-w-2xl px-4 py-6"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
          void handleTouchEnd();
        }}
      >
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-10 transition-all duration-200"
          style={{
            transform: `translateX(-50%) translateY(${Math.max(pullDistance - 30, -54)}px) scale(${0.92 + pullProgress * 0.08})`,
            opacity: pullDistance > 4 || isSyncing ? 1 : 0,
          }}
        >
          <div className="min-w-[208px] rounded-[22px] border border-white/60 bg-white/95 px-3 py-2.5 text-xs text-slate-700 shadow-lg shadow-[#053c35]/10 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-100 via-lime-50 to-emerald-100 dark:from-amber-500/20 dark:via-emerald-500/20 dark:to-slate-800"
                  style={{ opacity: isSyncing ? 1 : 0.65 + pullProgress * 0.35 }}
                />
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity="0.14"
                    strokeWidth="2.5"
                    className="text-[#0d5d55] dark:text-emerald-300"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="2.5"
                    strokeDasharray={94}
                    strokeDashoffset={94 - 94 * (isSyncing ? 0.88 : pullProgress)}
                    className="text-[#0f766e] transition-all duration-150 dark:text-amber-200"
                  />
                </svg>
                <RefreshCw
                  className={`relative h-4 w-4 text-[#0d5d55] dark:text-amber-100 ${isSyncing ? "animate-spin" : ""}`}
                  style={{ transform: isSyncing ? undefined : `rotate(${pullProgress * 180}deg)` }}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-900 dark:text-white">
                  {isSyncing ? "Synchronisation en cours" : pullDistance >= pullThreshold ? "Relâchez pour actualiser" : "Tirez pour actualiser"}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {isSyncing
                    ? "Récupération des données du serveur"
                    : pullDistance > 0
                    ? `${Math.round(pullProgress * 100)}%`
                    : "Depuis n’importe quel écran"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-x-4 top-0 z-0 overflow-hidden rounded-full"
          style={{ height: `${Math.min(pullDistance * 0.8, 56)}px`, opacity: Math.min(pullProgress * 0.9, 0.9) }}
        >
          <div
            className="h-full w-full rounded-full bg-gradient-to-r from-amber-300/35 via-lime-200/25 to-emerald-300/35 blur-xl dark:from-amber-300/20 dark:via-lime-300/10 dark:to-emerald-400/20"
            style={{ transform: `scaleX(${0.6 + pullProgress * 0.4})` }}
          />
        </div>
        <Outlet />
      </main>

      <nav
        className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-around pt-2 shadow-lg"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg transition-colors text-xs ${
                isActive
                  ? "text-[#0b6b5d] dark:text-amber-200 font-semibold"
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
