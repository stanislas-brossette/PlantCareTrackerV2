import { useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";
import api from "../lib/api";

interface IdentificationResult {
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

interface Props {
  plantId: string;
  plantName: string;
  onApplied?: () => void;
  onClose: () => void;
}

export default function IdentifyModal({ plantId, plantName, onApplied, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<"name" | "details" | "planning" | null>(null);
  const [result, setResult] = useState<IdentificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const identify = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ identification: IdentificationResult }>(
        `/identify/${plantId}`
      );
      setResult(res.data.identification);
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
      await api.patch(`/identify/${plantId}`, {
        identification: result,
        apply: {
          name: section === "name",
          details: section === "details",
          planning: section === "planning",
        },
      });
      onApplied?.();
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

  const MONTH_LABELS = ["J","F","M","A","M","J","J","A","S","O","N","D"];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              Identification IA
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          {!result && !loading && (
            <div className="text-center py-6">
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Analyser la photo de <strong>{plantName}</strong> avec l'IA ?
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
                    {MONTH_LABELS.map((m, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">{m}</span>
                        <span className="text-xs font-mono text-blue-600 dark:text-blue-400">
                          {result.arrosage_freq_par_mois![i] ?? "?"}
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
                    {MONTH_LABELS.map((m, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">{m}</span>
                        <span className="text-xs font-mono text-green-600 dark:text-green-400">
                          {result.fertilisation_freq_par_mois![i] ?? "?"}
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

        {/* Footer */}
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
              onClick={onClose}
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
