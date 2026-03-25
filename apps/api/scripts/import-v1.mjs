import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeName(value) {
  return value.trim();
}

function toMonthlyAverage(minValues, maxValues) {
  if (!Array.isArray(minValues) || !Array.isArray(maxValues)) return null;
  if (minValues.length !== 12 || maxValues.length !== 12) return null;

  return minValues.map((minValue, index) => {
    const maxValue = maxValues[index];
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return 0;
    return Math.round((minValue + maxValue) / 2);
  });
}

function averageNonZero(values) {
  if (!values) return null;
  const nonZero = values.filter((value) => value > 0);
  if (nonZero.length === 0) return null;
  return Math.round(nonZero.reduce((sum, value) => sum + value, 0) / nonZero.length);
}

function getLastClicked(lastClicked, plantName, label) {
  const raw = lastClicked[`button-${plantName}-${label}`];
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getUploadDir() {
  return path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  const backupDir = path.resolve(process.cwd(), "../../backup_V1");
  const plantsPath = path.join(backupDir, "plants.json");
  const lastClickedPath = path.join(backupDir, "lastClickedTimes.json");
  const locationsPath = path.join(backupDir, "locations.json");
  const imagesDir = path.join(backupDir, "images");

  for (const requiredFile of [plantsPath, lastClickedPath, locationsPath]) {
    if (!fs.existsSync(requiredFile)) {
      throw new Error(`Missing file: ${requiredFile}`);
    }
  }

  const sourcePlants = JSON.parse(fs.readFileSync(plantsPath, "utf8"));
  const lastClicked = JSON.parse(fs.readFileSync(lastClickedPath, "utf8"));
  const sourceLocations = JSON.parse(fs.readFileSync(locationsPath, "utf8"));

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
  const uploadDir = getUploadDir();
  ensureDir(uploadDir);

  // Reset the garden content before importing the right backup.
  const deletedPlants = await prisma.plant.deleteMany({
    where: { gardenId: garden.id },
  });
  const deletedLocations = await prisma.location.deleteMany({
    where: { gardenId: garden.id },
  });

  const locationNames = Array.from(
    new Set(
      [...sourceLocations, ...sourcePlants.map((plant) => plant.location).filter(Boolean)].map((name) =>
        String(name).trim()
      )
    )
  ).filter(Boolean);

  const createdLocations = {};
  for (const locationName of locationNames) {
    const location = await prisma.location.create({
      data: {
        gardenId: garden.id,
        name: locationName,
      },
    });
    createdLocations[locationName] = location.id;
  }

  let importedPlants = 0;
  let importedCareEvents = 0;
  let copiedImages = 0;
  let missingImages = 0;

  for (const sourcePlant of sourcePlants) {
    const plantName = normalizeName(sourcePlant.name);
    const wateringFreqByMonth = toMonthlyAverage(sourcePlant.wateringMin, sourcePlant.wateringMax);
    const fertilizingFreqByMonth = toMonthlyAverage(sourcePlant.feedingMin, sourcePlant.feedingMax);

    let photoUrl = null;
    if (sourcePlant.image) {
      const imageName = path.basename(sourcePlant.image);
      const sourceImagePath = path.join(imagesDir, imageName);
      const targetImagePath = path.join(uploadDir, imageName);
      if (fs.existsSync(sourceImagePath)) {
        fs.copyFileSync(sourceImagePath, targetImagePath);
        photoUrl = `/uploads/${imageName}`;
        copiedImages++;
      } else {
        missingImages++;
      }
    }

    const plant = await prisma.plant.create({
      data: {
        name: plantName,
        notes: sourcePlant.description?.trim() || null,
        photoUrl,
        archived: Boolean(sourcePlant.archived),
        gardenId: garden.id,
        locationId: sourcePlant.location ? createdLocations[String(sourcePlant.location).trim()] ?? null : null,
        wateringFreqDays: averageNonZero(wateringFreqByMonth),
        fertilizingFreqDays: averageNonZero(fertilizingFreqByMonth),
        wateringFreqByMonth: wateringFreqByMonth ? JSON.stringify(wateringFreqByMonth) : null,
        fertilizingFreqByMonth: fertilizingFreqByMonth
          ? JSON.stringify(fertilizingFreqByMonth)
          : null,
      },
    });

    importedPlants++;

    const careEvents = [
      { type: "WATERING", performedAt: getLastClicked(lastClicked, plantName, "Arrosage") },
      { type: "FERTILIZING", performedAt: getLastClicked(lastClicked, plantName, "Engrais") },
    ].filter((entry) => entry.performedAt instanceof Date);

    for (const careEvent of careEvents) {
      await prisma.careEvent.create({
        data: {
          plantId: plant.id,
          userId: ownerUserId,
          type: careEvent.type,
          performedAt: careEvent.performedAt,
          note: "Imported from V1 backup",
        },
      });
      importedCareEvents++;
    }
  }

  console.log(
    JSON.stringify(
      {
        gardenId: garden.id,
        deletedPlants: deletedPlants.count,
        deletedLocations: deletedLocations.count,
        recreatedLocations: locationNames.length,
        importedPlants,
        importedCareEvents,
        copiedImages,
        missingImages,
        archivedPlants: sourcePlants.filter((plant) => plant.archived).length,
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
