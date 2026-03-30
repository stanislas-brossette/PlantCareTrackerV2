import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import { Trash2, Edit, Sparkles, Undo2, Loader2, MoreVertical, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import toast from "react-hot-toast";
import { usePlant, usePlants } from "../hooks/usePlants";
import { useCareEvents, useRecordCare, useUndoCare } from "../hooks/useCare";
import IdentifyModal from "../components/IdentifyModal";
import MonthlyFreqOverview from "../components/MonthlyFreqOverview";
import { triggerLightHaptic } from "../lib/haptics";
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
    <div className="flex items-center gap-3 rounded-2xl bg-emerald-50/70 p-3 dark:bg-gray-900/70">
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
        className={`rounded-xl px-4 py-2 text-sm font-medium ${needs ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"}`}
      >
        {emoji}
      </button>
      <button onClick={onUndo} className="rounded-xl p-2 text-gray-400 hover:bg-white/80 dark:hover:bg-gray-800">
        <Undo2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function CareSection({
  emoji,
  label,
  freq,
  lastDate,
  needs,
  onRecord,
  onUndo,
  values,
  fallbackDays,
}: {
  emoji: string;
  label: string;
  freq: number | null | undefined;
  lastDate: string | null | undefined;
  needs: boolean | null | undefined;
  onRecord: () => void;
  onUndo: () => void;
  values: number[] | null | undefined;
  fallbackDays: number | null | undefined;
}) {
  const planningLabel = label === "Arrosage" ? "Planning d'arrosage" : "Planning de fertilisation";

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
      <ScheduleRow
        emoji={emoji}
        label={label}
        freq={freq}
        lastDate={lastDate}
        needs={needs}
        onRecord={onRecord}
        onUndo={onUndo}
      />
      <div className="mt-4">
        <MonthlyFreqOverview
          label={planningLabel}
          emoji={emoji}
          values={values}
          fallbackDays={fallbackDays}
          embedded
        />
      </div>
    </section>
  );
}

export default function PlantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: plant, isLoading } = usePlant(id);
  const { data: events = [] } = useCareEvents(id);
  const { plants, updatePlant, deletePlant } = usePlants();
  const recordCare = useRecordCare();
  const undoCare = useUndoCare();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeAnimatingBack, setIsSwipeAnimatingBack] = useState(false);
  const [routeTransitionOffset, setRouteTransitionOffset] = useState(0);

  const [showIdentify, setShowIdentify] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const direction =
      (location.state as { direction?: "next" | "prev" } | null)?.direction ?? null;
    if (!direction) {
      setRouteTransitionOffset(0);
      return;
    }

    setRouteTransitionOffset(direction === "next" ? 46 : -46);
    const frame = requestAnimationFrame(() => {
      setRouteTransitionOffset(0);
    });
    const timeout = window.setTimeout(() => {
      navigate(location.pathname, { replace: true, state: null });
    }, 230);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    setSwipeOffset(0);
    setIsSwipeAnimatingBack(false);
    setShowMenu(false);
    setShowIdentify(false);
  }, [id]);

  const siblingPlants = plants
    .filter((candidate) => candidate.archived === plant?.archived)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const currentIndex = siblingPlants.findIndex((candidate) => candidate.id === id);
  const prevPlant = currentIndex > 0 ? siblingPlants[currentIndex - 1] : null;
  const nextPlant = currentIndex >= 0 && currentIndex < siblingPlants.length - 1 ? siblingPlants[currentIndex + 1] : null;

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

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    swipeStartX.current = event.touches[0]?.clientX ?? null;
    swipeStartY.current = event.touches[0]?.clientY ?? null;
    setIsSwipeAnimatingBack(false);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (showMenu || showIdentify || swipeStartX.current === null || swipeStartY.current === null) {
      return;
    }

    const currentX = event.touches[0]?.clientX ?? 0;
    const currentY = event.touches[0]?.clientY ?? 0;
    const deltaX = currentX - swipeStartX.current;
    const deltaY = currentY - swipeStartY.current;

    if (Math.abs(deltaX) < Math.abs(deltaY)) {
      setSwipeOffset(0);
      return;
    }

    const canMovePrev = deltaX > 0 && prevPlant;
    const canMoveNext = deltaX < 0 && nextPlant;
    if (!canMovePrev && !canMoveNext) {
      setSwipeOffset(deltaX * 0.12);
      return;
    }

    setSwipeOffset(deltaX * 0.35);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (showMenu || showIdentify || swipeStartX.current === null || swipeStartY.current === null) {
      swipeStartX.current = null;
      swipeStartY.current = null;
      setSwipeOffset(0);
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? 0;
    const endY = event.changedTouches[0]?.clientY ?? 0;
    const deltaX = endX - swipeStartX.current;
    const deltaY = endY - swipeStartY.current;

    swipeStartX.current = null;
    swipeStartY.current = null;

    if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      setIsSwipeAnimatingBack(true);
      setSwipeOffset(0);
      return;
    }

    if (deltaX < 0 && nextPlant) {
      setSwipeOffset(0);
      triggerLightHaptic();
      navigate(`/plants/${nextPlant.id}`, { state: { direction: "next" } });
    } else if (deltaX > 0 && prevPlant) {
      setSwipeOffset(0);
      triggerLightHaptic();
      navigate(`/plants/${prevPlant.id}`, { state: { direction: "prev" } });
    } else {
      setIsSwipeAnimatingBack(true);
      setSwipeOffset(0);
    }
  };

  return (
    <div
      className={`space-y-4 ${isSwipeAnimatingBack || routeTransitionOffset !== 0 ? "transition-[transform,opacity] duration-200 ease-out" : ""}`}
      style={{
        transform: `translateX(${swipeOffset + routeTransitionOffset}px)`,
        opacity:
          (1 - Math.min(Math.abs(swipeOffset) / 420, 0.18)) *
          (1 - Math.min(Math.abs(routeTransitionOffset) / 340, 0.12)),
      }}
      onTransitionEnd={() => setIsSwipeAnimatingBack(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative rounded-2xl overflow-hidden bg-white shadow-sm dark:bg-gray-800">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-16 bg-gradient-to-r from-white/32 to-transparent dark:from-gray-900/28"
          style={{ opacity: prevPlant ? Math.min(Math.max(swipeOffset, 0) / 70, 1) : 0 }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-16 bg-gradient-to-l from-white/32 to-transparent dark:from-gray-900/28"
          style={{ opacity: nextPlant ? Math.min(Math.max(-swipeOffset, 0) / 70, 1) : 0 }}
        />
        {displayPhoto ? (
          <img src={displayPhoto} alt={plant.name} className="w-full object-cover max-h-72" />
        ) : (
          <div className="h-48 flex items-center justify-center text-5xl">🌿</div>
        )}

        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}>
          <h1 className="mr-3 flex-1 truncate font-bold text-white text-base">{plant.name}</h1>
          <div className="relative">
            <button onClick={() => setShowMenu((v) => !v)} className="p-2 rounded-xl bg-black/30 text-white hover:bg-black/50">
              <MoreVertical className="w-5 h-5" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-10 z-10 min-w-40 rounded-xl border border-slate-200 bg-white/98 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/96">
                <Link
                  to={`/plants/${id}/edit`}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-900 hover:bg-emerald-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Edit className="w-4 h-4" /> Modifier
                </Link>
                <button
                  onClick={() => {
                    setShowIdentify(true);
                    setShowMenu(false);
                  }}
                  disabled={!displayPhoto || !isOnline}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-900 hover:bg-emerald-50 disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Sparkles className="w-4 h-4" /> Identifier
                </button>
                <button
                  onClick={handleArchive}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-900 hover:bg-emerald-50 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  {plant.archived ? "Restaurer" : "Archiver"}
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>

        {prevPlant && (
          <button
            onClick={() => {
              triggerLightHaptic();
              navigate(`/plants/${prevPlant.id}`, { state: { direction: "prev" } });
            }}
            className="absolute left-2 top-1/2 z-[2] -translate-y-1/2 rounded-full bg-black/30 p-2 text-white transition-all hover:bg-black/50"
            style={{ opacity: 0.5 + Math.min(Math.max(swipeOffset, 0) / 90, 0.5), transform: `translateY(-50%) translateX(${Math.min(Math.max(swipeOffset, 0) / 10, 6)}px)` }}
            aria-label={`Plante précédente: ${prevPlant.name}`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {nextPlant && (
          <button
            onClick={() => {
              triggerLightHaptic();
              navigate(`/plants/${nextPlant.id}`, { state: { direction: "next" } });
            }}
            className="absolute right-2 top-1/2 z-[2] -translate-y-1/2 rounded-full bg-black/30 p-2 text-white transition-all hover:bg-black/50"
            style={{ opacity: 0.5 + Math.min(Math.max(-swipeOffset, 0) / 90, 0.5), transform: `translateY(-50%) translateX(${-Math.min(Math.max(-swipeOffset, 0) / 10, 6)}px)` }}
            aria-label={`Plante suivante: ${nextPlant.name}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {(prevPlant || nextPlant) && (
        <div className="text-center text-xs text-gray-400">
          Glisser horizontalement pour feuilleter les plantes
        </div>
      )}

      {plant.notes && (
        <div className="rounded-2xl bg-white p-4 text-sm text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-200 whitespace-pre-line">
          {plant.notes}
        </div>
      )}

      <div className="grid gap-4">
        <CareSection
          emoji="💧"
          label="Arrosage"
          freq={plant.currentWateringFreq}
          lastDate={plant.lastWatered}
          needs={plant.needsWatering}
          onRecord={() => handleCare("WATERING")}
          onUndo={() => handleUndo("WATERING")}
          values={plant.wateringFreqByMonth}
          fallbackDays={plant.wateringFreqDays}
        />
        <CareSection
          emoji="🌿"
          label="Fertilisation"
          freq={plant.currentFertilizingFreq}
          lastDate={plant.lastFertilized}
          needs={plant.needsFertilizing}
          onRecord={() => handleCare("FERTILIZING")}
          onUndo={() => handleUndo("FERTILIZING")}
          values={plant.fertilizingFreqByMonth}
          fallbackDays={plant.fertilizingFreqDays}
        />
      </div>

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
