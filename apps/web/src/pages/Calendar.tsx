import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format,
  isSameDay, isSameMonth, addMonths, subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { useCalendar } from "../hooks/useCare";
import { useAuthStore } from "../stores/auth";
import type { CareEvent, CareType } from "@plantcare/shared";

const TYPE_COLORS: Record<CareType, string> = {
  WATERING: "bg-blue-400",
  FERTILIZING: "bg-green-500",
  REPOTTING: "bg-orange-400",
  PRUNING: "bg-purple-400",
  TREATMENT: "bg-red-400",
  OTHER: "bg-gray-400",
};

const TYPE_ICONS: Record<CareType, string> = {
  WATERING: "💧",
  FERTILIZING: "🌿",
  REPOTTING: "🪴",
  PRUNING: "✂️",
  TREATMENT: "💊",
  OTHER: "📝",
};

export default function Calendar() {
  const { activeGardenId } = useAuthStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const to = format(endOfMonth(currentMonth), "yyyy-MM-dd");
  const { data: events = [] } = useCalendar(activeGardenId, from, to);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDayOfWeek = startOfMonth(currentMonth).getDay() || 7; // Mon=1

  const getEventsForDay = (day: Date): CareEvent[] =>
    events.filter((e) => isSameDay(new Date(e.performedAt), day));

  const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];

  return (
    <div className="space-y-5">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg text-gray-900 dark:text-white capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: fr })}
        </h1>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells before month start */}
          {Array.from({ length: startDayOfWeek - 1 }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(isSameDay(day, selectedDay!) ? null : day)}
                className={`aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-colors relative ${
                  isSelected
                    ? "bg-green-600 text-white"
                    : isToday
                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 font-bold"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {format(day, "d")}
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((e, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[e.type as CareType] ?? "bg-gray-400"} ${isSelected ? "opacity-80" : ""}`}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(TYPE_ICONS) as [CareType, string][]).map(([type, icon]) => (
          <div key={type} className="flex items-center gap-1 text-xs text-gray-500">
            <div className={`w-2.5 h-2.5 rounded-full ${TYPE_COLORS[type]}`} />
            {icon}
          </div>
        ))}
      </div>

      {/* Selected day events */}
      {selectedDay && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
            {format(selectedDay, "EEEE d MMMM", { locale: fr })}
          </h2>
          {selectedEvents.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">Aucun soin ce jour</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((event) => (
                <div key={event.id} className="flex items-center gap-3 py-2 border-b last:border-0 border-gray-50 dark:border-gray-700">
                  <span className="text-xl">{TYPE_ICONS[event.type as CareType] ?? "📝"}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {(event as CareEvent & { plant?: { name: string } }).plant?.name ?? "Plante"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(event.performedAt), "HH:mm")}
                      {event.note && ` · ${event.note}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Monthly summary */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Résumé du mois</h2>
        <div className="flex gap-6">
          {(Object.entries(TYPE_ICONS) as [CareType, string][]).map(([type, icon]) => {
            const count = events.filter((e) => e.type === type).length;
            if (count === 0) return null;
            return (
              <div key={type} className="text-center">
                <div className="text-2xl">{icon}</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{count}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
