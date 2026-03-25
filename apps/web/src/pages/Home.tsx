import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Archive } from "lucide-react";
import { usePlants } from "../hooks/usePlants";
import { useRecordCare } from "../hooks/useCare";
import { useAuthStore } from "../stores/auth";
import PlantCard from "../components/PlantCard";
import toast from "react-hot-toast";

export default function Home() {
  const { activeGardenId } = useAuthStore();
  const { plants, isLoading } = usePlants(activeGardenId);
  const recordCare = useRecordCare(activeGardenId);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = plants.filter((p) => {
    if (!showArchived && p.archived) return false;
    if (showArchived && !p.archived) return false;
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  const urgent = filtered.filter((p) => p.needsWatering || p.needsFertilizing);
  const normal = filtered.filter((p) => !p.needsWatering && !p.needsFertilizing);

  const handleCare = async (plantId: string, type: "WATERING" | "FERTILIZING") => {
    const labels = { WATERING: "arrosée 💧", FERTILIZING: "fertilisée 🌿" };
    await recordCare.mutateAsync({ plantId, type });
    const plant = plants.find((p) => p.id === plantId);
    toast.success(`${plant?.name} ${labels[type]}`);
  };

  if (!activeGardenId) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>Aucun jardin trouvé.</p>
        <Link to="/settings" className="text-green-600 underline text-sm mt-2 block">
          Créer un jardin dans les réglages
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Rechercher une plante..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <Link
          to="/plants/new"
          className="bg-green-600 text-white p-2.5 rounded-xl hover:bg-green-700 transition-colors flex-shrink-0"
        >
          <Plus className="w-5 h-5" />
        </Link>
      </div>

      {/* Toggle archived */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowArchived(false)}
          className={`flex-1 py-1.5 rounded-xl text-sm font-medium transition-colors ${
            !showArchived
              ? "bg-green-600 text-white"
              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
          }`}
        >
          Actives ({plants.filter((p) => !p.archived).length})
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`flex-1 py-1.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1 ${
            showArchived
              ? "bg-gray-600 text-white"
              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
          }`}
        >
          <Archive className="w-4 h-4" />
          Archivées ({plants.filter((p) => p.archived).length})
        </button>
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
              className="mt-4 inline-flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700"
            >
              <Plus className="w-4 h-4" />
              Ajouter une plante
            </Link>
          )}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div>
          {/* Column headers */}
          <div className="flex h-8 mb-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            <div className="w-48 flex-shrink-0 flex items-center px-2">Plante</div>
            <div className="flex-1 flex items-center justify-center">💧 Arrosage</div>
            <div className="flex-1 flex items-center justify-center">🌿 Engrais</div>
          </div>

          {/* Urgent */}
          {urgent.length > 0 && (
            <div className="space-y-1.5 mb-1.5">
              {urgent.map((plant) => (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  onWater={() => handleCare(plant.id, "WATERING")}
                  onFertilize={() => handleCare(plant.id, "FERTILIZING")}
                />
              ))}
            </div>
          )}

          {/* Separator */}
          {urgent.length > 0 && normal.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
          )}

          {/* Normal */}
          {normal.length > 0 && (
            <div className="space-y-1.5">
              {normal.map((plant) => (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  onWater={() => handleCare(plant.id, "WATERING")}
                  onFertilize={() => handleCare(plant.id, "FERTILIZING")}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
