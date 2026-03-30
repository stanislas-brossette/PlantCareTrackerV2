import type { PrismaClient } from "@prisma/client";
import type { BootstrapPayload } from "@plantcare/shared";
import { getEffectiveFreq, parseMonthlyFreq } from "./freq.js";

function computePlantStatus(
  plant: {
    wateringFreqDays: number | null;
    fertilizingFreqDays: number | null;
    wateringFreqByMonth: string | null;
    fertilizingFreqByMonth: string | null;
  },
  lastWatered: Date | null,
  lastFertilized: Date | null,
) {
  const now = new Date();
  const startOfDay = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };
  const daysSince = (date: Date | null) =>
    date
      ? (startOfDay(now).getTime() - startOfDay(date).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

  const waterFreq = getEffectiveFreq(plant.wateringFreqByMonth, plant.wateringFreqDays, now);
  const fertFreq = getEffectiveFreq(plant.fertilizingFreqByMonth, plant.fertilizingFreqDays, now);

  return {
    needsWatering: waterFreq != null && daysSince(lastWatered) >= waterFreq,
    needsFertilizing: fertFreq != null && daysSince(lastFertilized) >= fertFreq,
    currentWateringFreq: waterFreq,
    currentFertilizingFreq: fertFreq,
  };
}

async function attachPlantStatus(
  prisma: PrismaClient,
  plants: Array<{
    id: string;
    name: string;
    photoUrl: string | null;
    notes: string | null;
    wateringFreqDays: number | null;
    fertilizingFreqDays: number | null;
    wateringFreqByMonth: string | null;
    fertilizingFreqByMonth: string | null;
    archived: boolean;
    gardenId: string;
    locationId: string | null;
    createdAt: Date;
    updatedAt: Date;
    location?: {
      id: string;
      name: string;
      gardenId: string;
    } | null;
  }>,
) {
  const plantIds = plants.map((plant) => plant.id);
  const [lastWaterings, lastFertilizings] = plantIds.length
    ? await Promise.all([
        prisma.careEvent.findMany({
          where: { plantId: { in: plantIds }, type: "WATERING" },
          orderBy: { performedAt: "desc" },
          distinct: ["plantId"],
        }),
        prisma.careEvent.findMany({
          where: { plantId: { in: plantIds }, type: "FERTILIZING" },
          orderBy: { performedAt: "desc" },
          distinct: ["plantId"],
        }),
      ])
    : [[], []];

  const lastWMap = Object.fromEntries(lastWaterings.map((event) => [event.plantId, event.performedAt]));
  const lastFMap = Object.fromEntries(lastFertilizings.map((event) => [event.plantId, event.performedAt]));

  return plants.map((plant) => {
    const { needsWatering, needsFertilizing, currentWateringFreq, currentFertilizingFreq } =
      computePlantStatus(plant, lastWMap[plant.id] ?? null, lastFMap[plant.id] ?? null);

    return {
      id: plant.id,
      name: plant.name,
      photoUrl: plant.photoUrl,
      notes: plant.notes,
      wateringFreqDays: plant.wateringFreqDays,
      fertilizingFreqDays: plant.fertilizingFreqDays,
      wateringFreqByMonth: parseMonthlyFreq(plant.wateringFreqByMonth),
      fertilizingFreqByMonth: parseMonthlyFreq(plant.fertilizingFreqByMonth),
      archived: plant.archived,
      gardenId: plant.gardenId,
      locationId: plant.locationId,
      location: plant.location
        ? {
            id: plant.location.id,
            name: plant.location.name,
            gardenId: plant.location.gardenId,
          }
        : null,
      createdAt: plant.createdAt.toISOString(),
      updatedAt: plant.updatedAt.toISOString(),
      lastWatered: lastWMap[plant.id]?.toISOString() ?? null,
      lastFertilized: lastFMap[plant.id]?.toISOString() ?? null,
      needsWatering,
      needsFertilizing,
      currentWateringFreq,
      currentFertilizingFreq,
    };
  });
}

export async function getPlantWithStatus(prisma: PrismaClient, id: string) {
  const plants = await prisma.plant.findMany({
    where: { id },
    include: { location: true },
    take: 1,
  });

  const [plant] = await attachPlantStatus(prisma, plants);
  return plant ?? null;
}

export async function getPlantsWithStatusForGarden(
  prisma: PrismaClient,
  gardenId: string,
  archived?: boolean,
) {
  const plants = await prisma.plant.findMany({
    where: {
      gardenId,
      ...(archived === undefined ? {} : { archived }),
    },
    include: { location: true },
    orderBy: { name: "asc" },
  });

  return attachPlantStatus(prisma, plants);
}

export async function getPlantsWithStatusByIds(prisma: PrismaClient, ids: string[]) {
  if (ids.length === 0) return [];

  const plants = await prisma.plant.findMany({
    where: { id: { in: ids } },
    include: { location: true },
    orderBy: { name: "asc" },
  });

  return attachPlantStatus(prisma, plants);
}

export async function buildBootstrapPayload(
  prisma: PrismaClient,
  gardenId: string,
  gardenName: string,
  changeVersion: number,
): Promise<BootstrapPayload> {
  const [plants, locations, careEvents] = await Promise.all([
    getPlantsWithStatusForGarden(prisma, gardenId),
    prisma.location.findMany({
      where: { gardenId },
      orderBy: { name: "asc" },
    }),
    prisma.careEvent.findMany({
      where: { plant: { gardenId } },
      orderBy: { performedAt: "desc" },
    }),
  ]);

  return {
    context: {
      gardenId,
      gardenName,
    },
    plants: plants as BootstrapPayload["plants"],
    locations: locations as BootstrapPayload["locations"],
    careEvents: careEvents.map((event) => ({
      ...event,
      performedAt: event.performedAt.toISOString(),
    })) as BootstrapPayload["careEvents"],
    changeVersion,
    generatedAt: new Date().toISOString(),
  };
}
