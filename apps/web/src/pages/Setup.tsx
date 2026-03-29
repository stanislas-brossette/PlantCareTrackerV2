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
    <div className="min-h-screen bg-gradient-to-br from-green-100 via-lime-50 to-white px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl bg-white/90 p-6 shadow-xl shadow-green-900/10">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-green-600 p-3 text-white">
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
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Port</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="3000"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
            />
          </div>

          <button
            onClick={handleTest}
            disabled={testing || !host.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            Tester et synchroniser
          </button>
        </div>
      </div>
    </div>
  );
}
