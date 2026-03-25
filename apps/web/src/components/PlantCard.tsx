import { Link } from "react-router-dom";
import { Droplets, Sprout, AlertCircle, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { Plant } from "@plantcare/shared";

interface Props {
  plant: Plant;
  onWater: () => void;
  onFertilize: () => void;
}

function TimeAgo({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-400 text-xs">Jamais</span>;
  return (
    <span className="text-gray-500 text-xs">
      {formatDistanceToNow(new Date(date), { addSuffix: true, locale: fr })}
    </span>
  );
}

export default function PlantCard({ plant, onWater, onFertilize }: Props) {
  const urgent = plant.needsWatering || plant.needsFertilizing;

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border transition-all ${
        urgent
          ? "border-red-300 dark:border-red-600"
          : "border-gray-100 dark:border-gray-700"
      }`}
    >
      <Link to={`/plants/${plant.id}`} className="flex gap-3 p-4">
        {/* Photo */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-green-100 dark:bg-green-900 flex-shrink-0">
          {plant.photoUrl ? (
            <img
              src={plant.photoUrl}
              alt={plant.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🌿</div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{plant.name}</h3>
            {urgent && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
          </div>
          {plant.location && (
            <div className="flex items-center gap-1 text-gray-400 text-xs mt-0.5">
              <MapPin className="w-3 h-3" />
              {plant.location.name}
            </div>
          )}
          <div className="mt-1 flex gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>💧 <TimeAgo date={plant.lastWatered} /></span>
            <span>🌿 <TimeAgo date={plant.lastFertilized} /></span>
          </div>
        </div>
      </Link>

      {/* Action buttons */}
      <div className="flex border-t border-gray-100 dark:border-gray-700 divide-x divide-gray-100 dark:divide-gray-700">
        <button
          onClick={(e) => { e.preventDefault(); onWater(); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-bl-2xl transition-colors ${
            plant.needsWatering
              ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100"
              : "text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          }`}
        >
          <Droplets className="w-4 h-4" />
          Arroser
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onFertilize(); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-br-2xl transition-colors ${
            plant.needsFertilizing
              ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100"
              : "text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
          }`}
        >
          <Sprout className="w-4 h-4" />
          Fertiliser
        </button>
      </div>
    </div>
  );
}
