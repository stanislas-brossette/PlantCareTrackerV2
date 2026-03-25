import { useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";
import api from "../lib/api";

export interface IdentificationResult {
  nom_commun?: string;
  nom_latin?: string;
  famille?: string;
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

export default function IdentifyModal(props: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<"name" | "details" | "planning" | null>(null);
  const [result, setResult] = useState<IdentificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identify = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isDraftMode(props)) {
        const form = new FormData();
        form.append("file", props.imageFile);
        const res = await api.post<{ identification: IdentificationResult }>("/identify/preview", form);
        setResult(res.data.identification);
      } else {
        const res = await api.post<{ identification: IdentificationResult }>(
          `/identify/${props.plantId}`
        );
        setResult(res.data.identification);
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || "Erreur lors de l'identification");
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
        props.onApplied?.();
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(message || "Erreur lors de l'application");
    } finally {
      setApplying(null);
    }
  };

  const rows: [string, keyof IdentificationResult][] = [
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
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
                onClick={identify}
                className="bg-purple-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-purple-700 transition-colors"
              >
                Identifier
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
              <p className="text-gray-500">Analyse en cours...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
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
                    💧 Fréq. arrosage (j/mois)
                  </dt>
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
                    🌿 Fréq. fertilisation (j/mois)
                  </dt>
                  <dd className="mt-1 grid grid-cols-12 gap-0.5 text-center">
                    {monthLabels.map((month, index) => (
                      <div key={index} className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">{month}</span>
                        <span className="text-xs font-mono text-green-600 dark:text-green-400">
                          {result.fertilisation_freq_par_mois?.[index] ?? "?"}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              ) : (
                <div className="text-xs text-red-500">⚠️ Fréquences fertilisation non retournées par l'IA</div>
              )}
            </div>
          )}
        </div>

        {result && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => applySection("name")}
                disabled={!result.nom_commun || applying !== null}
                className="py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {applying === "name" ? "Application..." : "Appliquer le nom"}
              </button>
              <button
                onClick={() => applySection("details")}
                disabled={applying !== null}
                className="py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {applying === "details" ? "Application..." : "Appliquer les détails"}
              </button>
              <button
                onClick={() => applySection("planning")}
                disabled={applying !== null}
                className="py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {applying === "planning" ? "Application..." : "Appliquer les plannings"}
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(JSON.stringify(result, null, 2));
                }}
                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50"
              >
                Copier
              </button>
              <button
                onClick={props.onClose}
                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
