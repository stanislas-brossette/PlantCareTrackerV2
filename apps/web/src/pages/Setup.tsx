import { useState } from "react";
import { Loader2, Wifi } from "lucide-react";
import api from "../lib/api";
import { bootstrapFromServer } from "../lib/sync";
import { useAppStore } from "../stores/app";
import { useOfflineStore } from "../stores/offline";
import toast from "react-hot-toast";

export default function Setup() {
  const { serverHost, serverPort, protocol, setServerConfig, markSetupComplete } = useAppStore();
  const { setOnline, setLastSyncError } = useOfflineStore();
  const [host, setHost] = useState(serverHost);
  const [port, setPort] = useState(serverPort || "3000");
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      setServerConfig({ serverHost: host, serverPort: port, protocol });
      const res = await api.get("/health");
      await bootstrapFromServer();
      markSetupComplete();
      setOnline(true);
      setLastSyncError(null);
      toast.success(`Connecté à ${res.data.gardenName}`);
    } catch {
      setOnline(false);
      toast.error("Connexion au Raspberry Pi impossible");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-lime-50 to-amber-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white/90 p-6 shadow-xl shadow-[#053c35]/10">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-[#0b6b5d] p-3 text-white">
            <Wifi className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Configurer le serveur</h1>
            <p className="text-sm text-gray-500">Entrez l'adresse IP du Raspberry Pi.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Adresse IP / hôte</label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.42"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0b6b5d] focus:outline-none focus:ring-2 focus:ring-[#0b6b5d]/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Port</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="3000"
              className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0b6b5d] focus:outline-none focus:ring-2 focus:ring-[#0b6b5d]/20"
            />
          </div>

          <button
            onClick={handleTest}
            disabled={testing || !host.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0b6b5d] px-4 py-3 font-medium text-white hover:bg-[#09584d] disabled:opacity-60"
          >
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            Tester et synchroniser
          </button>
        </div>
      </div>
    </div>
  );
}
