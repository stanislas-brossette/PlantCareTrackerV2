import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ChangeSetPayload } from "@plantcare/shared";
import { getPlantsWithStatusByIds } from "./snapshot.js";

type EntityType = "PLANT" | "LOCATION" | "CARE_EVENT";
type ChangeType = "UPSERT" | "DELETE";

interface LoggedChangeInput {
  entityType: EntityType;
  entityId: string;
  changeType: ChangeType;
}

const listeners = new Set<(version: number) => void>();

export function subscribeToChangeFeed(listener: (version: number) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function broadcastChangeVersion(version: number) {
  for (const listener of listeners) {
    listener(version);
  }
}

export async function getLatestChangeVersion(prisma: PrismaClient, gardenId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ version: number }>>(
    'SELECT "version" FROM "ChangeLog" WHERE "gardenId" = ? ORDER BY "version" DESC LIMIT 1',
    gardenId,
  );

  return rows[0]?.version ?? 0;
}

export async function recordChanges(
  fastify: FastifyInstance,
  gardenId: string,
  changes: LoggedChangeInput[],
) {
  if (changes.length === 0) {
    return getLatestChangeVersion(fastify.prisma, gardenId);
  }

  for (const change of changes) {
    await fastify.prisma.$executeRawUnsafe(
      'INSERT INTO "ChangeLog" ("entityType", "entityId", "changeType", "gardenId") VALUES (?, ?, ?, ?)',
      change.entityType,
      change.entityId,
      change.changeType,
      gardenId,
    );
  }

  const version = await getLatestChangeVersion(fastify.prisma, gardenId);
  broadcastChangeVersion(version);
  return version;
}

function reduceToLatestChanges(
  changeLogs: Array<{ entityType: string; entityId: string; changeType: string }>,
) {
  const finalChanges = new Map<string, LoggedChangeInput>();

  for (const change of changeLogs) {
    finalChanges.set(`${change.entityType}:${change.entityId}`, {
      entityType: change.entityType as EntityType,
      entityId: change.entityId,
      changeType: change.changeType as ChangeType,
    });
  }

  return [...finalChanges.values()];
}

export async function buildChangesPayload(
  prisma: PrismaClient,
  gardenId: string,
  since: number,
): Promise<ChangeSetPayload> {
  const changeLogs = await prisma.$queryRawUnsafe<
    Array<{ version: number; entityType: string; entityId: string; changeType: string }>
  >(
    'SELECT "version", "entityType", "entityId", "changeType" FROM "ChangeLog" WHERE "gardenId" = ? AND "version" > ? ORDER BY "version" ASC',
    gardenId,
    since,
  );

  const currentVersion = changeLogs.at(-1)?.version ?? since;
  if (changeLogs.length === 0) {
    return {
      since,
      currentVersion,
      changes: {
        plants: [],
        deletedPlantIds: [],
        locations: [],
        deletedLocationIds: [],
        careEvents: [],
        deletedCareEventIds: [],
      },
      generatedAt: new Date().toISOString(),
    };
  }

  const reduced = reduceToLatestChanges(changeLogs);
  const plantIdsToFetch = reduced
    .filter((change) => change.entityType === "PLANT" && change.changeType === "UPSERT")
    .map((change) => change.entityId);
  const locationIdsToFetch = reduced
    .filter((change) => change.entityType === "LOCATION" && change.changeType === "UPSERT")
    .map((change) => change.entityId);
  const careIdsToFetch = reduced
    .filter((change) => change.entityType === "CARE_EVENT" && change.changeType === "UPSERT")
    .map((change) => change.entityId);

  const [plants, locations, careEvents] = await Promise.all([
    getPlantsWithStatusByIds(prisma, plantIdsToFetch),
    locationIdsToFetch.length
      ? prisma.location.findMany({
          where: { id: { in: locationIdsToFetch } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    careIdsToFetch.length
      ? prisma.careEvent.findMany({
          where: { id: { in: careIdsToFetch } },
          orderBy: { performedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return {
    since,
    currentVersion,
    changes: {
      plants: plants as ChangeSetPayload["changes"]["plants"],
      deletedPlantIds: reduced
        .filter((change) => change.entityType === "PLANT" && change.changeType === "DELETE")
        .map((change) => change.entityId),
      locations: locations as ChangeSetPayload["changes"]["locations"],
      deletedLocationIds: reduced
        .filter((change) => change.entityType === "LOCATION" && change.changeType === "DELETE")
        .map((change) => change.entityId),
      careEvents: careEvents.map((event) => ({
        ...event,
        performedAt: event.performedAt.toISOString(),
      })) as ChangeSetPayload["changes"]["careEvents"],
      deletedCareEventIds: reduced
        .filter((change) => change.entityType === "CARE_EVENT" && change.changeType === "DELETE")
        .map((change) => change.entityId),
    },
    generatedAt: new Date().toISOString(),
  };
}
