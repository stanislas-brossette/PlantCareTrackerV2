import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Home, RefreshCw, Trash2, Edit, Sparkles,
  Undo2, Loader2, MoreVertical, MapPin, ChevronLeft, ChevronRight
} from "lucide-react";
import { formatDistanceToNow, format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useCareEvents, useRecordCare, useUndoCare } from "../hooks/useCare";
import { useAuthStore } from "../stores/auth";
import IdentifyModal from "../components/IdentifyModal";
import toast from "react-hot-toast";
import api from "../lib/api";
import type { CareType } from "@plantcare/shared";

const CARE_LABELS: Record<CareType, { label: string; icon: string; color: string }> = {
  WATERING:    { label: "Arrosage",     icon: "💧", color: "text-blue-600" },
  FERTILIZING: { label: "Fertilisation", icon: "🌿", color: "text-green-600" },
  REPOTTING:   { label: "Rempotage",    icon: "🪴", color: "text-orange-600" },
  PRUNING:     { label: "Taille",       icon: "✂️", color: "text-purple-600" },
  TREATMENT:   { label: "Traitement",   icon: "💊", color: "text-red-600" },
  OTHER:       { label: "Autre",        icon: "📝", color: "text-gray-600" },
};

const MONTH_SHORT = ["J","F","M","A","M","J","J","A","S","O","N","D"];
const CURRENT_MONTH = new Date().getMonth();

/** Mini bar chart for a 12-month frequency array */
function FreqBar({ values }: { values: number[] }) {
  const max = Math.max(...values.filter(Boolean), 1);
  return (
    <div className="flex gap-px h-6 items-end">
      {values.map((v, i) => (
        <div
          key={i}
          title={`${MONTH_SHORT[i]}: ${v > 0 ? `${v}j` : "—"}`}
          className="flex-1 rounded-sm transition-all"
          style={{
            height: v > 0 ? `${Math.round((v / max) * 100)}%` : "3px",
            minHeight: "3px",
            backgroundColor:
              i === CURRENT_MONTH
                ? "#16a34a"
                : v === 0
                ? "#e5e7eb"
                : "#86efac",
          }}
        />
      ))}
    </div>
  );
}

/** Compact schedule block */
function ScheduleRow({
  emoji,
  label,
  freq,
  freqByMonth,
  lastDate,
  needs,
  onRecord,
  onUndo,
}: {
  emoji: string;
  label: string;
  freq: number | null | undefined;
  freqByMonth: number[] | null | undefined;
  lastDate: string | null | undefined;
  needs: boolean | null | undefined;
  onRecord: () => void;
  onUndo: () => void;
}) {
  const nextDate =
    lastDate && freq ? addDays(new Date(lastDate), freq) : null;

  return (
    <div className="flex items-center gap-3">
      {/* Mini bar chart */}
      <div className="w-24 flex-shrink-0">
        {freqByMonth ? (
          <FreqBar values={freqByMonth} />
        ) : (
          <div className="h-6 flex items-center">
            <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-600" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <span>{emoji} {label}</span>
          {freq && (
            <span className="text-gray-400">· tous les {freq}j</span>
          )}
        </div>
        <div className="text-xs text-gray-400 truncate">
          {lastDate
            ? `Dernier : ${formatDistanceToNow(new Date(lastDate), { addSuffix: true, locale: fr })}`
            : "Jamais"}
          {nextDate && (
            <span className="ml-1">
              · Prochain : {format(nextDate, "d MMM", { locale: fr })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 flex-shrink-0 items-center">
        <button
          onClick={onRecord}
          className={`px-4 py-2 rounded-xl text-base font-medium transition-colors ${
            needs
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 hover:bg-red-200"
              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200"
          }`}
        >
          {emoji}
        </button>
        <button
          onClick={onUndo}
          title="Annuler le dernier soin"
          className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function PlantDetail() {
  const { id } = useParams<{ id: string }>();
  const { activeGardenId } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: plant, isLoading } = usePlant(id);
  const { plants } = usePlants(activeGardenId);
  const { data: events = [] } = useCareEvents(id);
  const recordCare = useRecordCare(activeGardenId);
  const undoCare = useUndoCare(activeGardenId);

  const activePlants = plants.filter((p) => !p.archived);
  const currentIndex = activePlants.findIndex((p) => p.id === id);
  const prevPlant = currentIndex > 0 ? activePlants[currentIndex - 1] : null;
  const nextPlant = currentIndex < activePlants.length - 1 ? activePlants[currentIndex + 1] : null;

  const [showIdentify, setShowIdentify] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [careNote, setCareNote] = useState("");

  const handleCare = async (type: CareType) => {
    if (!id) return;
    await recordCare.mutateAsync({ plantId: id, type, note: careNote || undefined });
    setCareNote("");
    toast.success(`${CARE_LABELS[type].icon} ${CARE_LABELS[type].label} enregistré`);
  };

  const handleUndo = async (type: "WATERING" | "FERTILIZING") => {
    if (!id) return;
    await undoCare.mutateAsync({ plantId: id, type });
    toast.success("Action annulée");
  };

  const handleArchive = async () => {
    if (!id) return;
    await api.patch(`/plants/${id}`, { archived: !plant?.archived });
    toast.success(plant?.archived ? "Plante restaurée" : "Plante archivée");
    navigate("/");
  };

  const handleDelete = async () => {
    if (!id || !confirm("Supprimer définitivement cette plante ?")) return;
    await api.delete(`/plants/${id}`);
    toast.success("Plante supprimée");
    navigate("/");
  };

  const handleAcceptName = async (name: string) => {
    if (!id) return;
    await api.patch(`/plants/${id}`, { name });
    toast.success(`Plante renommée en "${name}"`);
    qc.invalidateQueries({ queryKey: ["plant", id] });
    qc.invalidateQueries({ queryKey: ["plants", activeGardenId] });
  };

  const handleIdentified = () => {
    qc.invalidateQueries({ queryKey: ["plant", id] });
    qc.invalidateQueries({ queryKey: ["plants", activeGardenId] });
    toast.success("Données de la plante mises à jour ✓");
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

  return (
    <div className="space-y-4">

      {/* Photo hero — full image visible, header overlaid */}
      <div className="relative rounded-2xl overflow-hidden">
        {plant.photoUrl ? (
          <img
            src={plant.photoUrl}
            alt={plant.name}
            className="w-full object-contain max-h-72"
          />
        ) : (
          <div className="h-40 flex items-center justify-center text-5xl">🌿</div>
        )}

        {/* Header overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-2"
          style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
        >
          <button
            onClick={() => navigate("/")}
            className="p-1.5 rounded-xl bg-black/30 text-white hover:bg-black/50"
          >
            <Home className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-white text-base truncate mx-2 drop-shadow">
            {plant.name}
          </h1>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 rounded-xl bg-black/30 text-white hover:bg-black/50"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-9 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 min-w-40">
                <Link
                  to={`/plants/${id}/edit`}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-xl"
                >
                  <Edit className="w-4 h-4" /> Modifier
                </Link>
                {plant.photoUrl && (
                  <button
                    onClick={() => { setShowIdentify(true); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-purple-600"
                  >
                    <Sparkles className="w-4 h-4" /> Identifier
                  </button>
                )}
                <button
                  onClick={handleArchive}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  {plant.archived ? "Restaurer" : "Archiver"}
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-red-600 rounded-b-xl"
                >
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Prev / Next plant navigation */}
        {prevPlant && (
          <button
            onClick={() => navigate(`/plants/${prevPlant.id}`)}
            title={prevPlant.name}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {nextPlant && (
          <button
            onClick={() => navigate(`/plants/${nextPlant.id}`)}
            title={nextPlant.name}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Info + plannings */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-3">
        {/* Location + notes */}
        {plant.location && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin className="w-3 h-3" /> {plant.location.name}
          </div>
        )}
        {plant.notes && (
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
            {plant.notes}
          </p>
        )}

        {/* Schedules */}
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-700">
          <ScheduleRow
            emoji="💧"
            label="Arrosage"
            freq={plant.currentWateringFreq}
            freqByMonth={plant.wateringFreqByMonth}
            lastDate={plant.lastWatered}
            needs={plant.needsWatering}
            onRecord={() => handleCare("WATERING")}
            onUndo={() => handleUndo("WATERING")}
          />
          <ScheduleRow
            emoji="🌿"
            label="Fertilisation"
            freq={plant.currentFertilizingFreq}
            freqByMonth={plant.fertilizingFreqByMonth}
            lastDate={plant.lastFertilized}
            needs={plant.needsFertilizing}
            onRecord={() => handleCare("FERTILIZING")}
            onUndo={() => handleUndo("FERTILIZING")}
          />
        </div>
      </div>

      {/* Other care actions */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Autres soins</h2>
        <input
          type="text"
          placeholder="Note (optionnelle)..."
          value={careNote}
          onChange={(e) => setCareNote(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <div className="grid grid-cols-4 gap-2">
          {(["REPOTTING", "PRUNING", "TREATMENT", "OTHER"] as CareType[]).map((type) => {
            const c = CARE_LABELS[type];
            return (
              <button
                key={type}
                onClick={() => handleCare(type)}
                disabled={recordCare.isPending}
                className="py-2 px-1 rounded-xl text-xs font-medium border bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-400 transition-colors flex flex-col items-center gap-1"
              >
                <span className="text-lg">{c.icon}</span>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Care history */}
      {events.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">
            Historique ({events.length})
          </h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.map((event) => {
              const c = CARE_LABELS[event.type as CareType] ?? CARE_LABELS.OTHER;
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 py-2 border-b border-gray-50 dark:border-gray-700 last:border-0"
                >
                  <span className="text-base">{c.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${c.color}`}>{c.label}</span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(event.performedAt), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(new Date(event.performedAt), "d MMM yyyy à HH:mm", { locale: fr })}
                      {event.user && ` · ${event.user.name ?? event.user.email}`}
                    </div>
                    {event.note && <p className="text-xs text-gray-500 mt-0.5 italic">{event.note}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showIdentify && (
        <IdentifyModal
          plantId={plant.id}
          plantName={plant.name}
          onAccept={handleAcceptName}
          onIdentified={handleIdentified}
          onClose={() => setShowIdentify(false)}
        />
      )}
    </div>
  );
}
