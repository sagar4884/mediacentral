-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "MediaCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER,
    "sizeOnDisk" BIGINT NOT NULL DEFAULT 0,
    "tmdbId" INTEGER,
    "tvdbId" INTEGER,
    "path" TEXT,
    "tags" TEXT NOT NULL,
    "keepStatus" TEXT NOT NULL DEFAULT 'waiting',
    "keepReason" TEXT,
    "aiScore" INTEGER,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaId" TEXT NOT NULL,
    "mediaName" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "PlexGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "libraries" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "PlexUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "banUntil" DATETIME
);

-- CreateTable
CREATE TABLE "_PlexGroupToPlexUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PlexGroupToPlexUser_A_fkey" FOREIGN KEY ("A") REFERENCES "PlexGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PlexGroupToPlexUser_B_fkey" FOREIGN KEY ("B") REFERENCES "PlexUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaCache_source_sourceId_key" ON "MediaCache"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlexGroup_name_key" ON "PlexGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_PlexGroupToPlexUser_AB_unique" ON "_PlexGroupToPlexUser"("A", "B");

-- CreateIndex
CREATE INDEX "_PlexGroupToPlexUser_B_index" ON "_PlexGroupToPlexUser"("B");
