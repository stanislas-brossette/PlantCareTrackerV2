import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  const password = await bcrypt.hash("password123", 12);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: { email: "alice@example.com", password, name: "Alice" },
  });

  const garden = await prisma.garden.create({
    data: {
      name: "Mon jardin",
      ownerId: alice.id,
      members: {
        create: { userId: alice.id, role: "OWNER" },
      },
    },
  });

  const livingRoom = await prisma.location.create({
    data: { name: "Salon", gardenId: garden.id },
  });

  await prisma.plant.createMany({
    data: [
      {
        name: "Monstera",
        notes: "Arroser quand le sol est sec sur 2cm",
        wateringFreqDays: 7,
        fertilizingFreqDays: 30,
        gardenId: garden.id,
        locationId: livingRoom.id,
      },
      {
        name: "Pothos",
        notes: "Très résistant, tolère l'ombre",
        wateringFreqDays: 10,
        fertilizingFreqDays: 30,
        gardenId: garden.id,
        locationId: livingRoom.id,
      },
    ],
  });

  console.log("✅ Seed done. Login: alice@example.com / password123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
