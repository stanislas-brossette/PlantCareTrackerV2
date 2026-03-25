import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

interface V1Plant {
  name: string;
  wateringFreq?: number[];
  feedingFreq?: number[];
  description?: string;
  image?: string;
}

type LastClickedMap = Record<string, string>;

const prisma = new PrismaClient();

function normalizeMonthlyFreq(values: number[] | undefined): number[] | null {
  if (!Array.isArray(values) || values.length !== 12) return null;
  return values.map((value) => {
    if (!Number.isFinite(value) || value <= 0 || value >= 1000) return 0;
    return Math.round(value);
  });
}

function averageNonZero(values: number[] | null): number | null {
  if (!values) return null;
  const nonZero = values.filter((value) => value > 0);
  if (nonZero.length === 0) return null;
  return Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length);
}

function getLastClicked(
  lastClicked: LastClickedMap,
  plantName: string,
  label: "Arrosage" | "Engrais"
): Date | null {
  const raw = lastClicked[`button-${plantName}-${label}`];
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function main() {
  const plantsPath = "/tmp/backup_pct/plants.json";
  const lastClickedPath = "/tmp/backup_pct/lastClickedTimes.json";

  if (!fs.existsSync(plantsPath)) {
    throw new Error(`Missing file: ${plantsPath}`);
  }
  if (!fs.existsSync(lastClickedPath)) {
    throw new Error(`Missing file: ${lastClickedPath}`);
  }

  const rawPlants = JSON.parse(fs.readFileSync(plantsPath, "utf8")) as V1Plant[];
  const lastClicked = JSON.parse(fs.readFileSync(lastClickedPath, "utf8")) as LastClickedMap;

  const garden = await prisma.garden.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      members: {
        where: { role: "OWNER" },
        select: { userId: true },
        take: 1,
      },
    },
  });

  if (!garden) {
    throw new Error("No garden found in V2 database");
  }

  const ownerUserId = garden.members[0]?.userId ?? garden.ownerId;
  let importedPlants = 0;
  let updatedPlants = 0;
  let importedCareEvents = 0;

  for (const v1Plant of rawPlants) {
    const wateringFreqByMonth = normalizeMonthlyFreq(v1Plant.wateringFreq);
    const fertilizingFreqByMonth = normalizeMonthlyFreq(v1Plant.feedingFreq);

    const payload = {
      name: v1Plant.name.trim(),
      notes: v1Plant.description?.trim() || null,
      wateringFreqDays: averageNonZero(wateringFreqByMonth),
      fertilizingFreqDays: averageNonZero(fertilizingFreqByMonth),
      wateringFreqByMonth: wateringFreqByMonth ? JSON.stringify(wateringFreqByMonth) : null,
      fertilizingFreqByMonth: fertilizingFreqByMonth
        ? JSON.stringify(fertilizingFreqByMonth)
        : null,
      gardenId: garden.id,
      photoUrl: null as string | null,
    };

    const imageName = v1Plant.image ? path.basename(v1Plant.image) : null;
    if (imageName) {
      const maybePhotoUrl = `/uploads/${imageName}`;
      const absolutePhotoPath = path.join(
        process.cwd(),
        process.env.UPLOAD_DIR || "uploads",
        imageName
      );
      if (fs.existsSync(absolutePhotoPath)) {
        payload.photoUrl = maybePhotoUrl;
      }
    }

    const existing = await prisma.plant.findFirst({
      where: { gardenId: garden.id, name: payload.name },
      select: { id: true },
    });

    const plant = existing
      ? await prisma.plant.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.plant.create({ data: payload });

    if (existing) updatedPlants++;
    else importedPlants++;

    const careEventsToCreate = [
      { type: "WATERING", performedAt: getLastClicked(lastClicked, payload.name, "Arrosage") },
      {
        type: "FERTILIZING",
        performedAt: getLastClicked(lastClicked, payload.name, "Engrais"),
      },
    ].filter(
      (entry): entry is { type: "WATERING" | "FERTILIZING"; performedAt: Date } =>
        entry.performedAt instanceof Date
    );

    for (const event of careEventsToCreate) {
      const existingEvent = await prisma.careEvent.findFirst({
        where: {
          plantId: plant.id,
          type: event.type,
          performedAt: event.performedAt,
        },
        select: { id: true },
      });

      if (!existingEvent) {
        await prisma.careEvent.create({
          data: {
            plantId: plant.id,
            userId: ownerUserId,
            type: event.type,
            performedAt: event.performedAt,
            note: "Imported from V1 backup",
          },
        });
        importedCareEvents++;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        gardenId: garden.id,
        importedPlants,
        updatedPlants,
        importedCareEvents,
        totalSourcePlants: rawPlants.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
