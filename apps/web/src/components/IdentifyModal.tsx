import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, X, Loader2 } from "lucide-react";
import api from "../lib/api";
import { db } from "../lib/db";
import type { LocalPlant } from "@plantcare/shared";

export interface IdentificationResult {
  nom_commun?: string;
  nom_latin?: string;
  famille?: string;
  confidence?: number;
  care_confidence?: number;
  needs_confirmation?: boolean;
  alternatives?: Array<{
    nom_commun?: string;
    nom_latin?: string;
    confidence?: number;
  }>;
  description?: string;
  arrosage?: string;
  arrosage_freq_par_mois?: number[];
  fertilisation?: string;
  fertilisation_freq_par_mois?: number[];
  lumiere?: string;
  temperature?: string;
  toxicite?: string;
  conseils?: string;
}

type TextResultKey =
  | "nom_commun"
  | "nom_latin"
  | "famille"
  | "description"
  | "arrosage"
  | "fertilisation"
  | "lumiere"
  | "temperature"
  | "toxicite"
  | "conseils";

interface AvailableUpdates {
  name: boolean;
  details: boolean;
  planning: boolean;
}

interface RetryContext {
  reason?: string;
  hints?: string[];
  freeText?: string;
  previousIdentification?: Partial<IdentificationResult>;
}

const RETRY_HINTS = [
  "Plante d'interieur",
  "Plante d'exterieur",
  "Succulente / cactus",
  "Plante retombante",
  "Plante grimpante",
  "Feuilles epaisses",
  "Feuilles fines",
  "Feuilles panachees",
  "Floraison visible",
  "Grande plante",
];

type ExistingPlantProps = {
  plantId: string;
  plantName: string;
  onApplied?: () => void;
  onClose: () => void;
  imageFile?: never;
  onApplyName?: never;
  onApplyDetails?: never;
  onApplyPlanning?: never;
};

type DraftPlantProps = {
  plantName: string;
  imageFile: File;
  onClose: () => void;
  onApplied?: () => void;
  onApplyName?: (name: string) => void;
  onApplyDetails?: (notes: string) => void;
  onApplyPlanning?: (planning: {
    wateringFreqByMonth: number[] | null;
    fertilizingFreqByMonth: number[] | null;
    wateringFreqDays: number | null;
    fertilizingFreqDays: number | null;
  }) => void;
  plantId?: never;
};

type Props = ExistingPlantProps | DraftPlantProps;

function buildNotes(result: IdentificationResult) {
  return [
    result.description ?? null,
    result.nom_latin ? `Nom latin : ${result.nom_latin}` : null,
    result.famille ? `Famille : ${result.famille}` : null,
    result.arrosage ? `💧 Arrosage : ${result.arrosage}` : null,
    result.fertilisation ? `🌿 Fertilisation : ${result.fertilisation}` : null,
    result.lumiere ? `☀️ Lumière : ${result.lumiere}` : null,
    result.temperature ? `🌡️ Température : ${result.temperature}` : null,
    result.toxicite ? `⚠️ Toxicité : ${result.toxicite}` : null,
    result.conseils ? `💡 Conseils : ${result.conseils}` : null,
  ].filter(Boolean).join("\n\n");
}

function averageNonZero(values: number[] | undefined) {
  if (!Array.isArray(values)) return null;
  const nonZero = values.filter((value) => value > 0);
  if (nonZero.length === 0) return null;
  return Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length);
}

function isDraftMode(props: Props): props is DraftPlantProps {
  return "imageFile" in props;
}

function buildPlantPatch(
  result: IdentificationResult,
  apply: { name?: boolean; details?: boolean; planning?: boolean },
) {
  const patch: Partial<LocalPlant> = {};

  if (apply.name && result.nom_commun) {
    patch.name = result.nom_commun;
  }

  if (apply.details) {
    const notes = buildNotes(result);
    if (notes) {
      patch.notes = notes;
    }
  }

  if (apply.planning) {
    const wateringFreqByMonth = result.arrosage_freq_par_mois ?? null;
    const fertilizingFreqByMonth = result.fertilisation_freq_par_mois ?? null;
    const wateringFreqDays = averageNonZero(result.arrosage_freq_par_mois);
    const fertilizingFreqDays = averageNonZero(result.fertilisation_freq_par_mois);

    patch.wateringFreqByMonth = wateringFreqByMonth;
    patch.fertilizingFreqByMonth = fertilizingFreqByMonth;
    patch.wateringFreqDays = wateringFreqDays;
    patch.fertilizingFreqDays = fertilizingFreqDays;
    patch.currentWateringFreq = wateringFreqByMonth
      ? wateringFreqByMonth[new Date().getMonth()] ?? wateringFreqDays
      : wateringFreqDays;
    patch.currentFertilizingFreq = fertilizingFreqByMonth
      ? fertilizingFreqByMonth[new Date().getMonth()] ?? fertilizingFreqDays
      : fertilizingFreqDays;
  }

  return patch;
}

export default function IdentifyModal(props: Props) {
  const identifyRequestConfig = { timeout: 45_000 };
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<"name" | "details" | "planning" | "all" | null>(null);
  const [result, setResult] = useState<IdentificationResult | null>(null);
  const [availableUpdates, setAvailableUpdates] = useState<AvailableUpdates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRetryForm, setShowRetryForm] = useState(false);
  const [retryHints, setRetryHints] = useState<string[]>([]);
  const [retryNotes, setRetryNotes] = useState("");
  const [loadingLabel, setLoadingLabel] = useState("Analyse en cours...");

  const toggleHint = (hint: string) => {
    setRetryHints((current) =>
      current.includes(hint) ? current.filter((item) => item !== hint) : [...current, hint],
    );
  };

  const buildRetryContext = (): RetryContext => ({
    reason: "L'utilisateur indique que l'identification precedente est probablement fausse.",
    hints: retryHints,
    freeText: retryNotes.trim() || undefined,
    previousIdentification: result
      ? {
          nom_commun: result.nom_commun,
          nom_latin: result.nom_latin,
          famille: result.famille,
          confidence: result.confidence,
        }
      : undefined,
  });

  const syncUpdatedPlantLocally = async (
    plantId: string,
    apply: { name?: boolean; details?: boolean; planning?: boolean },
    identification: IdentificationResult,
  ) => {
    const patch = buildPlantPatch(identification, apply);
    const queryPlant = queryClient.getQueryData<LocalPlant>(["plant", plantId]);
    const dbPlant = await db.plants.get(plantId);
    const sourcePlant = dbPlant ?? queryPlant;

    if (sourcePlant) {
      const updatedPlant: LocalPlant = {
        ...sourcePlant,
        ...patch,
        updatedAt: new Date().toISOString(),
      };

      await db.plants.put(updatedPlant);
      queryClient.setQueryData(["plant", plantId], updatedPlant);
      queryClient.setQueryData<LocalPlant[] | undefined>(["plants"], (current) =>
        current?.map((plant) => (plant.id === plantId ? { ...plant, ...patch, updatedAt: updatedPlant.updatedAt } : plant)),
      );
    }

    void queryClient.invalidateQueries({ queryKey: ["plant", plantId] });
    void queryClient.invalidateQueries({ queryKey: ["plants"] });
  };

  const identify = async (retryContext?: RetryContext) => {
    setLoading(true);
    setError(null);
    setLoadingLabel(retryContext ? "Nouvelle analyse avec tes indices..." : "Analyse en cours...");
    try {
      if (isDraftMode(props)) {
        const form = new FormData();
        form.append("file", props.imageFile);
        if (retryContext) {
          form.append("retryContext", JSON.stringify(retryContext));
        }
        const res = await api.post<{ identification: IdentificationResult; availableUpdates: AvailableUpdates }>(
          "/identify/preview",
          form,
          identifyRequestConfig,
        );
        setResult(res.data.identification);
        setAvailableUpdates(res.data.availableUpdates);
      } else {
        const res = await api.post<{ identification: IdentificationResult; availableUpdates: AvailableUpdates }>(
          `/identify/${props.plantId}`,
          retryContext ? { retryContext } : undefined,
          identifyRequestConfig,
        );
        setResult(res.data.identification);
        setAvailableUpdates(res.data.availableUpdates);
      }
      setShowRetryForm(false);
    } catch (err: unknown) {
      const responseMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      const requestMessage = err instanceof Error ? err.message : null;
      setError(responseMessage || requestMessage || "Erreur lors de l'identification");
    } finally {
      setLoading(false);
    }
  };

  const applySection = async (section: "name" | "details" | "planning") => {
    if (!result) return;
    setApplying(section);
    setError(null);
    try {
      if (isDraftMode(props)) {
        if (section === "name" && result.nom_commun) {
          props.onApplyName?.(result.nom_commun);
        }
        if (section === "details") {
          const notes = buildNotes(result);
          if (notes) props.onApplyDetails?.(notes);
        }
        if (section === "planning") {
          props.onApplyPlanning?.({
            wateringFreqByMonth: result.arrosage_freq_par_mois ?? null,
            fertilizingFreqByMonth: result.fertilisation_freq_par_mois ?? null,
            wateringFreqDays: averageNonZero(result.arrosage_freq_par_mois),
            fertilizingFreqDays: averageNonZero(result.fertilisation_freq_par_mois),
          });
        }
        props.onApplied?.();
      } else {
        await api.patch(`/identify/${props.plantId}`, {
          identification: result,
          apply: {
            name: section === "name",
            details: section === "details",
            planning: section === "planning",
          },
        });
        await syncUpdatedPlantLocally(
          props.plantId,
          {
            name: section === "name",
            details: section === "details",
            planning: section === "planning",
          },
          result,
        );
        props.onApplied?.();
      }
    } catch (err: unknown) {
      const responseMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      const requestMessage = err instanceof Error ? err.message : null;
      setError(responseMessage || requestMessage || "Erreur lors de l'application");
    } finally {
      setApplying(null);
    }
  };

  const applyEverything = async () => {
    if (!result) return;
    setApplying("all");
    setError(null);

    try {
      if (isDraftMode(props)) {
        if (result.nom_commun) {
          props.onApplyName?.(result.nom_commun);
        }

        const notes = buildNotes(result);
        if (notes) {
          props.onApplyDetails?.(notes);
        }

        props.onApplyPlanning?.({
          wateringFreqByMonth: result.arrosage_freq_par_mois ?? null,
          fertilizingFreqByMonth: result.fertilisation_freq_par_mois ?? null,
          wateringFreqDays: averageNonZero(result.arrosage_freq_par_mois),
          fertilizingFreqDays: averageNonZero(result.fertilisation_freq_par_mois),
        });

        props.onApplied?.();
        props.onClose();
      } else {
        await api.patch(`/identify/${props.plantId}`, {
          identification: result,
          apply: {
            name: true,
            details: true,
            planning: true,
          },
        });
        await syncUpdatedPlantLocally(
          props.plantId,
          {
            name: true,
            details: true,
            planning: true,
          },
          result,
        );
        props.onApplied?.();
        props.onClose();
      }
    } catch (err: unknown) {
      const responseMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      const requestMessage = err instanceof Error ? err.message : null;
      setError(responseMessage || requestMessage || "Erreur lors de l'application");
    } finally {
      setApplying(null);
    }
  };

  const rows: [string, TextResultKey][] = [
    ["Nom commun", "nom_commun"],
    ["Nom latin", "nom_latin"],
    ["Famille", "famille"],
    ["Description", "description"],
    ["Arrosage", "arrosage"],
    ["Fertilisation", "fertilisation"],
    ["Lumière", "lumiere"],
    ["Température", "temperature"],
    ["Toxicité", "toxicite"],
    ["Conseils", "conseils"],
  ];

  const monthLabels = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  const confidencePercent = result?.confidence != null ? Math.round(result.confidence * 100) : null;
  const careConfidencePercent =
    result?.care_confidence != null ? Math.round(result.care_confidence * 100) : null;
  const showConfirmationBadge =
    result?.needs_confirmation && (result.confidence == null || result.confidence < 0.5);
  const showLowConfidenceWarning =
    result != null &&
    ((result.confidence ?? 1) < 0.5 || (result.care_confidence ?? result.confidence ?? 1) < 0.5);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
      }}
    >
      <div className="mt-1 flex max-h-[calc(100vh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl dark:bg-gray-800">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Identification IA
            </h2>
          </div>
          <button onClick={props.onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {!result && !loading && (
            <div className="text-center py-6">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Analyser la photo de <strong>{props.plantName}</strong> avec l'IA ?
              </p>
              <button
                onClick={() => {
                  void identify();
                }}
                className="bg-[#0b6b5d] text-white px-6 py-2.5 rounded-xl font-medium hover:bg-[#09584d] transition-colors"
              >
                Identifier
              </button>
            </div>
          )}

          {loading && !result && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-gray-500">{loadingLabel}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {loading ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {loadingLabel}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {confidencePercent != null ? (
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Confiance identification : {confidencePercent}%
                  </div>
                ) : null}
                {careConfidencePercent != null ? (
                  <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                    Confiance conseils : {careConfidencePercent}%
                  </div>
                ) : null}
                {showConfirmationBadge ? (
                  <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                    Confirmation recommandee
                  </div>
                ) : null}
              </div>

              {result.alternatives?.length ? (
                <div className="rounded-2xl border border-gray-100 p-3 dark:border-gray-700">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Alternatives possibles
                  </div>
                  <div className="mt-2 space-y-1">
                    {result.alternatives.map((alternative, index) => (
                      <div key={`${alternative.nom_latin ?? alternative.nom_commun ?? index}`} className="text-sm text-gray-700 dark:text-gray-200">
                        {alternative.nom_commun || alternative.nom_latin}
                        {alternative.nom_commun && alternative.nom_latin ? ` · ${alternative.nom_latin}` : ""}
                        {alternative.confidence != null ? ` · ${Math.round(alternative.confidence * 100)}%` : ""}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {rows.map(([label, key]) =>
                result[key] ? (
                  <div key={key}>
                    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {label}
                    </dt>
                    <dd className="whitespace-pre-line text-gray-900 dark:text-white text-sm mt-0.5">
                      {result[key]}
                    </dd>
                  </div>
                ) : null
              )}

              {result.arrosage_freq_par_mois ? (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    💧 Arrosage
                  </dt>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Nombre de jours entre deux arrosages, mois par mois.
                  </p>
                  <dd className="mt-1 grid grid-cols-12 gap-0.5 text-center">
                    {monthLabels.map((month, index) => (
                      <div key={index} className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">{month}</span>
                        <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                          {result.arrosage_freq_par_mois?.[index] ?? "?"}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : (
                <div className="text-xs text-red-500">⚠️ Fréquences arrosage non retournées par l'IA</div>
              )}

              {result.fertilisation_freq_par_mois ? (
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    🌿 Fertilisation
                  </dt>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Nombre de jours entre deux fertilisations, mois par mois.
                  </p>
                  <dd className="mt-1 grid grid-cols-12 gap-0.5 text-center">
                    {monthLabels.map((month, index) => (
                      <div key={index} className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">{month}</span>
                        <span className="text-xs font-mono text-[#0b6b5d] dark:text-amber-300">
                          {result.fertilisation_freq_par_mois?.[index] ?? "?"}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : (
                <div className="text-xs text-red-500">⚠️ Fréquences fertilisation non retournées par l'IA</div>
              )}

              {showLowConfidenceWarning ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                  L'identification semble incertaine, mais tu peux quand meme enregistrer le nom, les details ou le planning si tu juges que la proposition est correcte.
                </div>
              ) : null}

              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Ce n'est pas la bonne plante ?
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Tu peux donner quelques indices supplémentaires pour aider l'IA à refaire une proposition plus fiable.
                </p>
                <button
                  onClick={() => setShowRetryForm((current) => !current)}
                  className="mt-3 rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
                >
                  {showRetryForm ? "Masquer les indices" : "Ce n'est pas la bonne plante"}
                </button>

                {showRetryForm ? (
                  <div className="mt-3 space-y-3">
                    {loading ? (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/20">
                        <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-200">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {loadingLabel}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {RETRY_HINTS.map((hint) => {
                        const selected = retryHints.includes(hint);
                        return (
                          <button
                            key={hint}
                            type="button"
                            onClick={() => toggleHint(hint)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                              selected
                                ? "bg-[#0b6b5d] text-white"
                                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"
                            }`}
                          >
                            {hint}
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      value={retryNotes}
                      onChange={(event) => setRetryNotes(event.target.value)}
                      placeholder="Exemple : feuilles veloutees, nervures blanches, ressemble a une calathea..."
                      className="min-h-[88px] w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-gray-700 dark:bg-slate-900 dark:text-white"
                    />

                    <button
                      onClick={() => {
                        void identify(buildRetryContext());
                      }}
                      disabled={loading}
                      className="w-full rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {loading ? "Nouvelle analyse..." : "Relancer avec ces indices"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="space-y-3 border-t border-gray-100 p-4 dark:border-gray-700">
            <div className="rounded-2xl bg-emerald-50/80 p-3 dark:bg-emerald-950/30">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Comment veux-tu utiliser la suggestion ?
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Tu peux tout appliquer d’un coup, ou ne garder qu’une seule partie.
              </p>
            </div>

            <button
              onClick={() => {
                void applyEverything();
              }}
              disabled={applying !== null || loading || !(availableUpdates?.name || availableUpdates?.details || availableUpdates?.planning)}
              className="flex w-full items-center justify-center rounded-2xl bg-[#0b6b5d] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#09584d] disabled:opacity-50"
            >
              {applying === "all" ? "Application..." : "Tout appliquer"}
            </button>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => applySection("name")}
                disabled={!availableUpdates?.name || !result.nom_commun || applying !== null || loading}
                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {applying === "name" ? "Application..." : "Nom seulement"}
              </button>
              <button
                onClick={() => applySection("details")}
                disabled={!availableUpdates?.details || applying !== null || loading}
                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {applying === "details" ? "Application..." : "Détails seulement"}
              </button>
              <button
                onClick={() => applySection("planning")}
                disabled={!availableUpdates?.planning || applying !== null || loading}
                className="rounded-2xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {applying === "planning" ? "Application..." : "Planning seulement"}
              </button>
            </div>

            <button
              onClick={props.onClose}
              className="w-full rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
