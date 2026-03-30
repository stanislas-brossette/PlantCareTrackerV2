-- CreateTable
CREATE TABLE "ChangeLog" (
    "version" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "gardenId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChangeLog_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "Garden" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChangeLog_gardenId_version_idx" ON "ChangeLog"("gardenId", "version");

-- CreateIndex
CREATE INDEX "ChangeLog_gardenId_entityType_entityId_idx" ON "ChangeLog"("gardenId", "entityType", "entityId");
