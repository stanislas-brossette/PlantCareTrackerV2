import { useState } from "react";
import { Loader2, MapPin, RefreshCw, Server, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../lib/api";
import { bootstrapFromServer } from "../lib/sync";
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
      await bootstrapFromServer();
      setOnline(true);
      setLastSyncError(null);
      toast.success("Synchronisation complète terminée");
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

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Réglages</h1>

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
