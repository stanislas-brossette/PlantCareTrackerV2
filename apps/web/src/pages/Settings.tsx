import { useEffect, useState } from "react";
import { Loader2, MapPin, Moon, RefreshCw, Server, Sun, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api";
import { clearPendingActions } from "../lib/db";
import { runFullResync } from "../lib/sync";
import { useCreateLocation, useDeleteLocation, useLocations } from "../hooks/useGarden";
import { useAppStore } from "../stores/app";
import { useOfflineStore } from "../stores/offline";

export default function Settings() {
  const { data: locations = [] } = useLocations();
  const createLocation = useCreateLocation();
  const deleteLocation = useDeleteLocation();
  const { serverHost, serverPort, protocol, setServerConfig, lastSuccessfulSyncAt } = useAppStore();
  const { pendingCount, setOnline, setLastSyncError } = useOfflineStore();

  const [host, setHost] = useState(serverHost);
  const [port, setPort] = useState(serverPort);
  const [newLocName, setNewLocName] = useState("");
  const [testing, setTesting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleSaveServer = async () => {
    setTesting(true);
    try {
      setServerConfig({ serverHost: host, serverPort: port, protocol });
      await api.get("/health");
      setOnline(true);
      setLastSyncError(null);
      toast.success("Serveur enregistré");
    } catch {
      setOnline(false);
      toast.error("Connexion impossible");
    } finally {
      setTesting(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const result = await runFullResync();
      setOnline(true);
      if (result.queued.remaining === 0) {
        setLastSyncError(null);
        toast.success("Synchronisation complète terminée");
      } else {
        setLastSyncError(`${result.queued.remaining} action(s) encore en attente`);
        toast.error(`${result.queued.remaining} action(s) encore en attente`);
      }
    } catch {
      setOnline(false);
      toast.error("Resynchronisation impossible");
    } finally {
      setResyncing(false);
    }
  };

  const handleAddLocation = async () => {
    if (!newLocName.trim()) return;
    await createLocation.mutateAsync(newLocName.trim());
    setNewLocName("");
    toast.success("Emplacement créé");
  };

  const handleClearPending = async () => {
    const confirmed = window.confirm(
      "Supprimer toutes les actions en attente ? Cette opération ne peut pas être annulée."
    );
    if (!confirmed) return;

    await clearPendingActions();
    setLastSyncError(null);
    toast.success("File de synchronisation vidée");
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Réglages</h1>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Apparence</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Choisir le mode clair ou sombre.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            className={`relative inline-flex h-11 w-24 items-center rounded-full px-1 transition-colors ${
              theme === "dark" ? "bg-slate-900" : "bg-amber-100"
            }`}
            aria-label={`Activer le mode ${theme === "dark" ? "clair" : "sombre"}`}
          >
            <span
              className={`absolute inset-y-1 flex w-10 items-center justify-center rounded-full text-xs font-medium transition-all ${
                theme === "dark"
                  ? "translate-x-[calc(100%+0.25rem)] bg-slate-700 text-slate-100"
                  : "translate-x-0 bg-white text-amber-700 shadow-sm"
              }`}
            >
              {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </span>
            <span className="flex w-full items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wide">
              <span className={theme === "light" ? "text-amber-700" : "text-slate-400"}>Clair</span>
              <span className={theme === "dark" ? "text-slate-200" : "text-amber-500/70"}>Sombre</span>
            </span>
          </button>
        </div>
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Server className="w-4 h-4" />
          Serveur Raspberry Pi
        </div>
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="192.168.1.42"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-700 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
        />
        <input
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="3000"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-700 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
        />
        <button
          onClick={handleSaveServer}
          disabled={testing}
          className="w-full rounded-xl bg-[#0b6b5d] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#09584d] disabled:opacity-60"
        >
          {testing ? "Test..." : "Tester et enregistrer"}
        </button>
        <button
          onClick={handleResync}
          disabled={resyncing}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <span className="inline-flex items-center gap-2">
            {resyncing && <Loader2 className="w-4 h-4 animate-spin" />}
            <RefreshCw className="w-4 h-4" />
            Resynchroniser
          </span>
        </button>
        <div className="text-xs text-gray-500">
          Dernière sync : {lastSuccessfulSyncAt ? new Date(lastSuccessfulSyncAt).toLocaleString("fr-FR") : "jamais"}
        </div>
        <div className="text-xs text-gray-500">Actions en attente : {pendingCount}</div>
        {pendingCount > 0 && (
          <button
            onClick={() => {
              void handleClearPending();
            }}
            className="w-full rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            Vider la file d'actions
          </button>
        )}
      </section>

      <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">Emplacements</h2>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {locations.map((loc) => (
            <div key={loc.id} className="flex items-center gap-3 px-4 py-3">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{loc.name}</span>
              <button onClick={() => deleteLocation.mutate(loc.id)} className="p-1 text-red-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 flex gap-2 border-t border-gray-50 dark:border-gray-700">
          <input
            type="text"
            value={newLocName}
            onChange={(e) => setNewLocName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddLocation()}
            placeholder="Salon, Cuisine..."
            className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          />
          <button onClick={handleAddLocation} className="rounded-xl bg-[#0b6b5d] px-4 text-white hover:bg-[#09584d]">
            +
          </button>
        </div>
      </section>
    </div>
  );
}
