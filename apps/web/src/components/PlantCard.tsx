import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { Plant } from "@plantcare/shared";

interface Props {
  plant: Plant;
  onWater: () => void;
  onFertilize: () => void;
}

function StatusBadge({
  date,
  needs,
  onClick,
}: {
  date: string | null;
  needs: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const label = date
    ? formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr })
    : "Jamais";

  return (
    <button
      onClick={onClick}
      title="Cliquer pour enregistrer"
      className={`w-full h-full flex items-center justify-center text-sm font-medium rounded-lg transition-opacity hover:opacity-80 active:opacity-60 ${
        needs
          ? "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      }`}
    >
      {label}
    </button>
  );
}

export default function PlantCard({ plant, onWater, onFertilize }: Props) {
  return (
    <div className="flex h-16 bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700">
      {/* Photo + Nom */}
      <Link
        to={`/plants/${plant.id}`}
        className="relative w-48 flex-shrink-0 block"
      >
        {plant.photoUrl ? (
          <img
            src={plant.photoUrl}
            alt={plant.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-3xl">
            🌿
          </div>
        )}
        {/* Gradient + nom */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent flex items-center px-2">
          <span className="text-white text-sm font-semibold truncate drop-shadow">
            {plant.name}
          </span>
        </div>
      </Link>

      {/* Arrosage */}
      <div className="flex-1 flex items-center px-2">
        <StatusBadge
          date={plant.lastWatered}
          needs={plant.needsWatering ?? false}
          onClick={(e) => { e.preventDefault(); onWater(); }}
        />
      </div>

      {/* Engrais */}
      <div className="flex-1 flex items-center px-2">
        <StatusBadge
          date={plant.lastFertilized}
          needs={plant.needsFertilizing ?? false}
          onClick={(e) => { e.preventDefault(); onFertilize(); }}
        />
      </div>
    </div>
  );
}
