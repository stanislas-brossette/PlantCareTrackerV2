import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Droplets, Sprout, Scissors, RefreshCw,
  Trash2, Edit, Sparkles, Undo2, Loader2, MoreVertical
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { usePlant } from "../hooks/usePlants";
import { useCareEvents, useRecordCare, useUndoCare } from "../hooks/useCare";
import { useAuthStore } from "../stores/auth";
import IdentifyModal from "../components/IdentifyModal";
import toast from "react-hot-toast";
import api from "../lib/api";
import type { CareType } from "@plantcare/shared";

const CARE_LABELS: Record<CareType, { label: string; icon: string; color: string }> = {
  WATERING: { label: "Arrosage", icon: "💧", color: "text-blue-600" },
  FERTILIZING: { label: "Fertilisation", icon: "🌿", color: "text-green-600" },
  REPOTTING: { label: "Rempotage", icon: "🪴", color: "text-orange-600" },
  PRUNING: { label: "Taille", icon: "✂️", color: "text-purple-600" },
  TREATMENT: { label: "Traitement", icon: "💊", color: "text-red-600" },
  OTHER: { label: "Autre", icon: "📝", color: "text-gray-600" },
};

export default function PlantDetail() {
  const { id } = useParams<{ id: string }>();
  const { activeGardenId } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: plant, isLoading } = usePlant(id);
  const { data: events = [] } = useCareEvents(id);
  const recordCare = useRecordCare(activeGardenId);
  const undoCare = useUndoCare(activeGardenId);

  const [showIdentify, setShowIdentify] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [careNote, setCareNote] = useState("");

  const handleCare = async (type: CareType) => {
    if (!id) return;
    await recordCare.mutateAsync({ plantId: id, type, note: careNote || undefined });
    setCareNote("");
    const c = CARE_LABELS[type];
    toast.success(`${c.icon} ${c.label} enregistré`);
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
    // Refetch plant data to show updated notes + frequencies
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg text-gray-900 dark:text-white truncate flex-1 text-center mx-3">
          {plant.name}
        </h1>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 min-w-40">
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

      {/* Photo */}
      {plant.photoUrl && (
        <div className="rounded-2xl overflow-hidden h-56 bg-gray-100 dark:bg-gray-800">
          <img src={plant.photoUrl} alt={plant.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Info */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-2 shadow-sm">
        {plant.notes && <p className="text-gray-600 dark:text-gray-300 text-sm">{plant.notes}</p>}
        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          {plant.location && <span>📍 {plant.location.name}</span>}
          {plant.currentWateringFreq != null && (
            <span title="Fréquence ce mois-ci">
              💧 tous les {plant.currentWateringFreq}j
              {plant.wateringFreqByMonth && <span className="text-xs text-green-600 ml-1">(saisonnier)</span>}
            </span>
          )}
          {plant.currentFertilizingFreq != null && (
            <span title="Fréquence ce mois-ci">
              🌿 tous les {plant.currentFertilizingFreq}j
              {plant.fertilizingFreqByMonth && <span className="text-xs text-green-600 ml-1">(saisonnier)</span>}
            </span>
          )}
        </div>
      </div>

      {/* Quick care buttons */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Enregistrer un soin</h2>
        <input
          type="text"
          placeholder="Note (optionnelle)..."
          value={careNote}
          onChange={(e) => setCareNote(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <div className="grid grid-cols-3 gap-2">
          {(["WATERING", "FERTILIZING", "REPOTTING", "PRUNING", "TREATMENT", "OTHER"] as CareType[]).map((type) => {
            const c = CARE_LABELS[type];
            return (
              <button
                key={type}
                onClick={() => handleCare(type)}
                disabled={recordCare.isPending}
                className={`py-2 px-1 rounded-xl text-xs font-medium border transition-colors flex flex-col items-center gap-1 ${
                  type === "WATERING" && plant.needsWatering
                    ? "bg-red-50 border-red-300 text-red-600 dark:bg-red-900/20"
                    : type === "FERTILIZING" && plant.needsFertilizing
                    ? "bg-red-50 border-red-300 text-red-600 dark:bg-red-900/20"
                    : "bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-400"
                }`}
              >
                <span className="text-lg">{c.icon}</span>
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Undo row */}
        <div className="flex gap-2">
          <button
            onClick={() => handleUndo("WATERING")}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50"
          >
            <Undo2 className="w-3 h-3" /> Annuler arrosage
          </button>
          <button
            onClick={() => handleUndo("FERTILIZING")}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50"
          >
            <Undo2 className="w-3 h-3" /> Annuler fertilisation
          </button>
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
                  <span className="text-lg">{c.icon}</span>
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
