import { useStats } from "../hooks/useCare";
import { useAuthStore } from "../stores/auth";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import type { GardenStats } from "@plantcare/shared";

export default function Stats() {
  const { activeGardenId } = useAuthStore();
  const { data: stats, isLoading } = useStats(activeGardenId) as {
    data: GardenStats | undefined;
    isLoading: boolean;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!stats) return null;

  const adherenceData = stats.plantStats
    .filter((p) => p.adherenceScore !== null)
    .map((p) => ({
      name: p.plantName.slice(0, 12),
      score: p.adherenceScore,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const wateringData = stats.plantStats
    .filter((p) => p.avgWateringIntervalDays !== null)
    .map((p) => ({
      name: p.plantName.slice(0, 12),
      avg: Math.round(p.avgWateringIntervalDays! * 10) / 10,
      count: p.wateringCount,
    }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Statistiques</h1>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-green-600">{stats.totalPlants}</div>
          <div className="text-sm text-gray-500 mt-1">Plantes actives</div>
        </div>
        <div className={`rounded-2xl p-4 shadow-sm text-center ${
          stats.plantsNeedingAttention > 0
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-white dark:bg-gray-800"
        }`}>
          <div className={`text-3xl font-bold ${stats.plantsNeedingAttention > 0 ? "text-red-600" : "text-gray-900 dark:text-white"}`}>
            {stats.plantsNeedingAttention}
          </div>
          <div className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1">
            {stats.plantsNeedingAttention > 0 ? (
              <><AlertTriangle className="w-3 h-3 text-red-500" /> À arroser</>
            ) : (
              <><CheckCircle className="w-3 h-3 text-green-500" /> Tout va bien</>
            )}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.careEventsThisWeek}</div>
          <div className="text-sm text-gray-500 mt-1">Soins cette semaine</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm text-center">
          <div className="text-3xl font-bold text-purple-600">{stats.careEventsThisMonth}</div>
          <div className="text-sm text-gray-500 mt-1">Soins ce mois</div>
        </div>
      </div>

      {/* Adherence chart */}
      {adherenceData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
            Score d'assiduité (arrosage) — %
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={adherenceData} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}%`, "Score"]} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {adherenceData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      (entry.score ?? 0) >= 80
                        ? "#16a34a"
                        : (entry.score ?? 0) >= 50
                        ? "#f59e0b"
                        : "#ef4444"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Avg watering interval */}
      {wateringData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 text-sm">
            Intervalle moyen d'arrosage (jours)
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={wateringData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}j`, "Intervalle moyen"]} />
              <Bar dataKey="avg" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-plant table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Détail par plante</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs border-b border-gray-100 dark:border-gray-700">
                <th className="pb-2 pr-3">Plante</th>
                <th className="pb-2 pr-3 text-center">💧</th>
                <th className="pb-2 pr-3 text-center">🌿</th>
                <th className="pb-2 text-center">Score</th>
              </tr>
            </thead>
            <tbody>
              {stats.plantStats.map((p) => (
                <tr key={p.plantId} className="border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <td className="py-2 pr-3 font-medium text-gray-900 dark:text-white truncate max-w-24">
                    {p.plantName}
                  </td>
                  <td className="py-2 pr-3 text-center text-gray-500">{p.wateringCount}</td>
                  <td className="py-2 pr-3 text-center text-gray-500">{p.fertilizingCount}</td>
                  <td className="py-2 text-center">
                    {p.adherenceScore !== null ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.adherenceScore >= 80
                            ? "bg-green-100 text-green-700"
                            : p.adherenceScore >= 50
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {p.adherenceScore}%
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
