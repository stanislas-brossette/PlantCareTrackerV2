import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Home, Trash2, Edit, Sparkles, Undo2, Loader2, MoreVertical } from "lucide-react";
import { addDays, format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import toast from "react-hot-toast";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useCareEvents, useRecordCare, useUndoCare } from "../hooks/useCare";
import IdentifyModal from "../components/IdentifyModal";
import { resolveAssetUrl } from "../lib/serverConfig";
import { useOfflineStore } from "../stores/offline";
import type { CareType } from "@plantcare/shared";

const CARE_LABELS: Record<CareType, { label: string; icon: string }> = {
  WATERING: { label: "Arrosage", icon: "💧" },
  FERTILIZING: { label: "Fertilisation", icon: "🌿" },
  REPOTTING: { label: "Rempotage", icon: "🪴" },
  PRUNING: { label: "Taille", icon: "✂️" },
  TREATMENT: { label: "Traitement", icon: "💊" },
  OTHER: { label: "Autre", icon: "📝" },
};

function ScheduleRow({
  emoji,
  label,
  freq,
  lastDate,
  needs,
  onRecord,
  onUndo,
}: {
  emoji: string;
  label: string;
  freq: number | null | undefined;
  lastDate: string | null | undefined;
  needs: boolean | null | undefined;
  onRecord: () => void;
  onUndo: () => void;
}) {
  const nextDate = lastDate && freq ? addDays(new Date(lastDate), freq) : null;

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-gray-800">
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white">{label}</div>
        <div className="text-xs text-gray-500">
          {lastDate
            ? `Dernier : ${formatDistanceToNow(new Date(lastDate), { addSuffix: true, locale: fr })}`
            : "Jamais"}
          {nextDate && <span className="ml-1">· Prochain : {format(nextDate, "d MMM", { locale: fr })}</span>}
        </div>
      </div>
      <button
        onClick={onRecord}
        className={`rounded-xl px-4 py-2 text-sm font-medium ${needs ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
      >
        {emoji}
      </button>
      <button onClick={onUndo} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
        <Undo2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function PlantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: plant, isLoading } = usePlant(id);
  const { data: events = [] } = useCareEvents(id);
  const { updatePlant, deletePlant } = usePlants();
  const recordCare = useRecordCare();
  const undoCare = useUndoCare();
  const isOnline = useOfflineStore((s) => s.isOnline);

  const [showIdentify, setShowIdentify] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const handleCare = async (type: CareType) => {
    if (!id) return;
    await recordCare.mutateAsync({ plantId: id, type });
    toast.success(`${CARE_LABELS[type].icon} ${CARE_LABELS[type].label} enregistré`);
  };

  const handleUndo = async (type: "WATERING" | "FERTILIZING") => {
    if (!id) return;
    await undoCare.mutateAsync({ plantId: id, type });
    toast.success("Action annulée");
  };

  const handleArchive = async () => {
    if (!id || !plant) return;
    await updatePlant.mutateAsync({ id, archived: !plant.archived });
    toast.success(plant.archived ? "Plante restaurée" : "Plante archivée");
    navigate("/");
  };

  const handleDelete = async () => {
    if (!id) return;
    await deletePlant.mutateAsync(id);
    toast.success("Plante supprimée");
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!plant) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Plante introuvable</p>
        <Link to="/" className="text-green-600 underline text-sm mt-2 block">Retour</Link>
      </div>
    );
  }

  const displayPhoto = plant.cachedPhotoUrl || resolveAssetUrl(plant.photoUrl);

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-white shadow-sm dark:bg-gray-800">
        {displayPhoto ? (
          <img src={displayPhoto} alt={plant.name} className="w-full object-cover max-h-72" />
        ) : (
          <div className="h-48 flex items-center justify-center text-5xl">🌿</div>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}>
          <button onClick={() => navigate("/")} className="p-2 rounded-xl bg-black/30 text-white hover:bg-black/50">
            <Home className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-white text-base truncate mx-2">{plant.name}</h1>
          <div className="relative">
            <button onClick={() => setShowMenu((v) => !v)} className="p-2 rounded-xl bg-black/30 text-white hover:bg-black/50">
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-10 min-w-40">
                <Link to={`/plants/${id}/edit`} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  <Edit className="w-4 h-4" /> Modifier
                </Link>
                <button
                  onClick={() => {
                    setShowIdentify(true);
                    setShowMenu(false);
                  }}
                  disabled={!displayPhoto || !isOnline}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Sparkles className="w-4 h-4" /> Identifier
                </button>
                <button onClick={handleArchive} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
                  {plant.archived ? "Restaurer" : "Archiver"}
                </button>
                <button onClick={handleDelete} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {plant.notes && (
        <div className="rounded-2xl bg-white p-4 text-sm text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200 whitespace-pre-line">
          {plant.notes}
        </div>
      )}

      <ScheduleRow
        emoji="💧"
        label="Arrosage"
        freq={plant.currentWateringFreq}
        lastDate={plant.lastWatered}
        needs={plant.needsWatering}
        onRecord={() => handleCare("WATERING")}
        onUndo={() => handleUndo("WATERING")}
      />
      <ScheduleRow
        emoji="🌿"
        label="Fertilisation"
        freq={plant.currentFertilizingFreq}
        lastDate={plant.lastFertilized}
        needs={plant.needsFertilizing}
        onRecord={() => handleCare("FERTILIZING")}
        onUndo={() => handleUndo("FERTILIZING")}
      />

      <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Historique</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun soin enregistré.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="border-b border-gray-100 pb-2 last:border-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {CARE_LABELS[event.type].icon} {CARE_LABELS[event.type].label}
                </div>
                <div className="text-xs text-gray-500">
                  {format(new Date(event.performedAt), "d MMM yyyy HH:mm", { locale: fr })}
                  {event.note ? ` · ${event.note}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showIdentify && displayPhoto && id && (
        <IdentifyModal
          plantId={id}
          plantName={plant.name}
          onApplied={() => toast.success("Modification appliquée")}
          onClose={() => setShowIdentify(false)}
        />
      )}
    </div>
  );
}
