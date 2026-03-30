import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Archive, MapPin, Settings } from "lucide-react";
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
  const [showSearch, setShowSearch] = useState(false);

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
    <div className="space-y-4 pb-24">
      <section className="rounded-[1.6rem] border border-emerald-100/80 bg-white/85 p-3 shadow-sm shadow-[#053c35]/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75">
        <div className="flex items-center gap-2">
          <div className="inline-flex min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/70">
            <button
              onClick={() => setShowArchived(false)}
              className={`flex-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !showArchived
                  ? "bg-[#0b6b5d] text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              Actives ({activeCount})
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`flex-1 px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                showArchived
                  ? "bg-[#0b6b5d] text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Archivées ({archivedCount})
            </button>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowSearch((value) => {
                  if (value) {
                    setSearch("");
                  }
                  return !value;
                });
              }}
              className={`rounded-xl p-2.5 transition-colors ${
                showSearch || search
                  ? "bg-emerald-100 text-[#0b6b5d] dark:bg-emerald-950/40 dark:text-emerald-200"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
              }`}
              aria-label="Afficher la recherche"
            >
              <Search className="h-4.5 w-4.5" />
            </button>
            <Link
              to="/settings"
              className="rounded-xl bg-slate-100 p-2.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              aria-label="Ouvrir les réglages"
            >
              <Settings className="h-4.5 w-4.5" />
            </Link>
          </div>
        </div>

        {showSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="search"
              placeholder="Rechercher une plante..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 focus:border-[#0b6b5d]/40 focus:outline-none focus:ring-2 focus:ring-[#0b6b5d]/20"
            />
          </div>
        )}
      </section>

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
            <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">Utilise le bouton + en bas à droite pour commencer.</p>
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

      <Link
        to="/plants/new"
        className="fixed bottom-5 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0b6b5d] text-white shadow-lg shadow-[#053c35]/25 transition-transform transition-colors hover:bg-[#09584d] active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        aria-label="Ajouter une plante"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
