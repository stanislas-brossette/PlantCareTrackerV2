import { FastifyPluginAsync } from "fastify";
import { ensureMvpContext } from "../utils/mvp.js";
import { getEffectiveFreq, parseMonthlyFreq } from "../utils/freq.js";

function computePlantStatus(
  plant: {
    wateringFreqDays: number | null;
    fertilizingFreqDays: number | null;
    wateringFreqByMonth: string | null;
    fertilizingFreqByMonth: string | null;
  },
  lastWatered: Date | null,
  lastFertilized: Date | null
) {
  const now = new Date();
  const daysSince = (date: Date | null) =>
    date ? (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

  const waterFreq = getEffectiveFreq(plant.wateringFreqByMonth, plant.wateringFreqDays, now);
  const fertFreq = getEffectiveFreq(plant.fertilizingFreqByMonth, plant.fertilizingFreqDays, now);

  return {
    needsWatering: waterFreq != null && daysSince(lastWatered) >= waterFreq,
    needsFertilizing: fertFreq != null && daysSince(lastFertilized) >= fertFreq,
    currentWateringFreq: waterFreq,
    currentFertilizingFreq: fertFreq,
  };
}

const bootstrapRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/bootstrap", async (_req, reply) => {
    const { garden } = await ensureMvpContext(fastify);
    const [plants, locations, careEvents] = await Promise.all([
      fastify.prisma.plant.findMany({
        where: { gardenId: garden.id },
        include: { location: true },
        orderBy: { name: "asc" },
      }),
      fastify.prisma.location.findMany({
        where: { gardenId: garden.id },
        orderBy: { name: "asc" },
      }),
      fastify.prisma.careEvent.findMany({
        where: { plant: { gardenId: garden.id } },
        orderBy: { performedAt: "desc" },
      }),
    ]);

    const lastWateringByPlant = new Map<string, Date>();
    const lastFertilizingByPlant = new Map<string, Date>();

    for (const event of careEvents) {
      if (event.type === "WATERING" && !lastWateringByPlant.has(event.plantId)) {
        lastWateringByPlant.set(event.plantId, event.performedAt);
      }
      if (event.type === "FERTILIZING" && !lastFertilizingByPlant.has(event.plantId)) {
        lastFertilizingByPlant.set(event.plantId, event.performedAt);
      }
    }

    reply.send({
      context: {
        gardenId: garden.id,
        gardenName: garden.name,
      },
      plants: plants.map((plant) => {
        const { needsWatering, needsFertilizing, currentWateringFreq, currentFertilizingFreq } =
          computePlantStatus(
            plant,
            lastWateringByPlant.get(plant.id) ?? null,
            lastFertilizingByPlant.get(plant.id) ?? null
          );

        return {
          ...plant,
          wateringFreqByMonth: parseMonthlyFreq(plant.wateringFreqByMonth),
          fertilizingFreqByMonth: parseMonthlyFreq(plant.fertilizingFreqByMonth),
          lastWatered: lastWateringByPlant.get(plant.id) ?? null,
          lastFertilized: lastFertilizingByPlant.get(plant.id) ?? null,
          needsWatering,
          needsFertilizing,
          currentWateringFreq,
          currentFertilizingFreq,
        };
      }),
      locations,
      careEvents,
      generatedAt: new Date().toISOString(),
    });
  });
};

export default bootstrapRoutes;
