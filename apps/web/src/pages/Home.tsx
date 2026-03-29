import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Archive, MapPin } from "lucide-react";
import { usePlants } from "../hooks/usePlants";
import { useRecordCare } from "../hooks/useCare";
import PlantCard from "../components/PlantCard";
import toast from "react-hot-toast";
import { useAppStore } from "../stores/app";
import { useOfflineStore } from "../stores/offline";

export default function Home() {
  const { gardenName, hasLocalData } = useAppStore();
  const { plants, isLoading } = usePlants();
  const recordCare = useRecordCare();
  const isOnline = useOfflineStore((s) => s.isOnline);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const activeCount = plants.filter((p) => !p.archived).length;
  const archivedCount = plants.filter((p) => p.archived).length;

  const filtered = plants.filter((p) => {
    if (!showArchived && p.archived) return false;
    if (showArchived && !p.archived) return false;
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  const groupedPlants = Object.values(
    filtered.reduce<Record<string, { label: string; sortKey: string; plants: typeof filtered }>>(
      (acc, plant) => {
        const label = plant.location?.name?.trim() || "Sans emplacement";
        const sortKey = plant.location?.name?.trim().toLocaleLowerCase() || "\uffff";

        if (!acc[label]) {
          acc[label] = { label, sortKey, plants: [] };
        }

        acc[label].plants.push(plant);
        return acc;
      },
      {}
    )
  )
    .map((group) => ({
      ...group,
      plants: [...group.plants].sort((a, b) => {
        const aUrgent = a.needsWatering || a.needsFertilizing ? 1 : 0;
        const bUrgent = b.needsWatering || b.needsFertilizing ? 1 : 0;
        if (aUrgent !== bUrgent) return bUrgent - aUrgent;
        return a.name.localeCompare(b.name, "fr");
      }),
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "fr"));

  const handleCare = async (plantId: string, type: "WATERING" | "FERTILIZING") => {
    const labels = { WATERING: "arrosée 💧", FERTILIZING: "fertilisée 🌿" };
    await recordCare.mutateAsync({ plantId, type });
    const plant = plants.find((p) => p.id === plantId);
    toast.success(`${plant?.name} ${labels[type]}`);
  };

  if (!gardenName && !hasLocalData && plants.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Aucune donnée synchronisée.</p>
        <Link to="/settings" className="text-[#0b6b5d] underline text-sm mt-2 block">
          Vérifier l'IP du serveur dans Réglages
        </Link>
      </div>
    );
  }

  if (!isOnline && plants.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Aucune donnée locale trouvée sur cet appareil.</p>
        <p className="text-sm mt-2">Reconnecte-toi au Wi‑Fi une fois pour effectuer une synchronisation complète.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
            Maison
          </p>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {showArchived ? "Plantes archivées" : gardenName ?? "Mes plantes"}
          </h1>
        </div>
        <Link
          to="/plants/new"
          className="bg-[#0b6b5d] text-white p-2.5 rounded-xl hover:bg-[#09584d] transition-colors flex-shrink-0 shadow-sm shadow-[#053c35]/10"
          aria-label="Ajouter une plante"
        >
          <Plus className="w-5 h-5" />
        </Link>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{activeCount} active{activeCount > 1 ? "s" : ""}</span>
        <span className="text-gray-300 dark:text-gray-600">•</span>
        <span>{archivedCount} archivée{archivedCount > 1 ? "s" : ""}</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="search"
            placeholder="Rechercher une plante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-full border border-gray-200 bg-transparent pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 dark:border-gray-700 dark:text-gray-200 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#0b6b5d]/30 focus:border-[#0b6b5d]/40"
          />
        </div>

        <div className="inline-flex w-full sm:w-auto rounded-full border border-gray-200 dark:border-gray-700 bg-white/40 dark:bg-gray-800/50 p-1">
          <button
            onClick={() => setShowArchived(false)}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !showArchived
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            Actives ({activeCount})
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
              showArchived
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            Archivées ({archivedCount})
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🌱</div>
          <p className="text-gray-500 dark:text-gray-400">
            {search ? "Aucune plante trouvée" : "Aucune plante pour l'instant"}
          </p>
          {!search && (
            <Link
              to="/plants/new"
              className="mt-4 inline-flex items-center gap-2 bg-[#0b6b5d] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#09584d]"
            >
              <Plus className="w-4 h-4" />
              Ajouter une plante
            </Link>
          )}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-4">
          {/* Column headers */}
          <div className="flex h-8 mb-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            <div className="w-48 flex-shrink-0 flex items-center px-2">Plante</div>
            <div className="flex-1 flex items-center justify-center">💧 Arrosage</div>
            <div className="flex-1 flex items-center justify-center">🌿 Engrais</div>
          </div>

          {groupedPlants.map((group) => (
            <section key={group.label} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <MapPin className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  {group.label}
                </h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  ({group.plants.length})
                </span>
              </div>

              <div className="space-y-1.5">
                {group.plants.map((plant) => (
                  <PlantCard
                    key={plant.id}
                    plant={plant}
                    onWater={() => handleCare(plant.id, "WATERING")}
                    onFertilize={() => handleCare(plant.id, "FERTILIZING")}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
