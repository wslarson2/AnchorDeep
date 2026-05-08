-- CreateEnum
CREATE TYPE "SourceSite" AS ENUM ('BOAT_TRADER', 'YACHT_WORLD', 'BOATS_COM', 'EBAY_MOTORS', 'CRAIGSLIST', 'FACEBOOK_MARKETPLACE');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'EXPIRED', 'RELISTED');

-- CreateEnum
CREATE TYPE "BoatType" AS ENUM ('POWERBOAT', 'SAILBOAT', 'PONTOON', 'PWC', 'FISHING', 'HOUSEBOAT', 'CATAMARAN', 'INFLATABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "HullMaterial" AS ENUM ('FIBERGLASS', 'ALUMINUM', 'STEEL', 'WOOD', 'COMPOSITE', 'INFLATABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "PropulsionType" AS ENUM ('OUTBOARD', 'INBOARD', 'STERNDRIVE', 'SAIL', 'ELECTRIC', 'JET', 'OTHER');

-- CreateEnum
CREATE TYPE "SpecDataType" AS ENUM ('NUMBER', 'TEXT', 'BOOLEAN');

-- CreateTable
CREATE TABLE "SpecKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unit" TEXT,
    "dataType" "SpecDataType" NOT NULL DEFAULT 'TEXT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SpecKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "type" "BoatType",
    "lengthFt" DECIMAL(5,2),
    "hullMaterial" "HullMaterial",
    "propulsion" "PropulsionType",
    "engineHours" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "currentPriceUsd" INTEGER,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),
    "soldPriceUsd" INTEGER,
    "fingerprintHash" TEXT,
    "canonicalSourceId" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSpec" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "specKeyId" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "valueNumber" DECIMAL(12,4),

    CONSTRAINT "ListingSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSource" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "site" "SourceSite" NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "lastScrapedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "soldHint" BOOLEAN NOT NULL DEFAULT false,
    "rawDataJson" JSONB,

    CONSTRAINT "ListingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "priceUsd" INTEGER NOT NULL,
    "status" "ListingStatus" NOT NULL,
    "priceChanged" BOOLEAN NOT NULL DEFAULT false,
    "priceChangePct" DECIMAL(6,2),
    "prevPriceUsd" INTEGER,
    "rawPriceStr" TEXT,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isThumbnail" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "auth0Id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedListing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "targetPriceUsd" INTEGER,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeRun" (
    "id" TEXT NOT NULL,
    "site" "SourceSite" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "listingsFound" INTEGER NOT NULL DEFAULT 0,
    "listingsNew" INTEGER NOT NULL DEFAULT 0,
    "priceChanges" INTEGER NOT NULL DEFAULT 0,
    "soldDetected" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorLog" JSONB,

    CONSTRAINT "ScrapeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecKey_key_key" ON "SpecKey"("key");

-- CreateIndex
CREATE INDEX "Listing_status_state_idx" ON "Listing"("status", "state");

-- CreateIndex
CREATE INDEX "Listing_type_status_idx" ON "Listing"("type", "status");

-- CreateIndex
CREATE INDEX "Listing_make_model_year_idx" ON "Listing"("make", "model", "year");

-- CreateIndex
CREATE INDEX "Listing_fingerprintHash_idx" ON "Listing"("fingerprintHash");

-- CreateIndex
CREATE INDEX "Listing_currentPriceUsd_idx" ON "Listing"("currentPriceUsd");

-- CreateIndex
CREATE INDEX "Listing_firstSeenAt_idx" ON "Listing"("firstSeenAt");

-- CreateIndex
CREATE INDEX "Listing_lat_lng_idx" ON "Listing"("lat", "lng");

-- CreateIndex
CREATE INDEX "ListingSpec_specKeyId_valueNumber_idx" ON "ListingSpec"("specKeyId", "valueNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ListingSpec_listingId_specKeyId_key" ON "ListingSpec"("listingId", "specKeyId");

-- CreateIndex
CREATE INDEX "ListingSource_listingId_idx" ON "ListingSource"("listingId");

-- CreateIndex
CREATE INDEX "ListingSource_site_isActive_idx" ON "ListingSource"("site", "isActive");

-- CreateIndex
CREATE INDEX "ListingSource_lastScrapedAt_idx" ON "ListingSource"("lastScrapedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ListingSource_site_externalId_key" ON "ListingSource"("site", "externalId");

-- CreateIndex
CREATE INDEX "PriceSnapshot_listingId_createdAt_idx" ON "PriceSnapshot"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_createdAt_idx" ON "PriceSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_priceChanged_idx" ON "PriceSnapshot"("priceChanged");

-- CreateIndex
CREATE INDEX "ListingImage_listingId_sortOrder_idx" ON "ListingImage"("listingId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "User_auth0Id_key" ON "User"("auth0Id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListing_userId_listingId_key" ON "SavedListing"("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceAlert_userId_listingId_key" ON "PriceAlert"("userId", "listingId");

-- CreateIndex
CREATE INDEX "ScrapeRun_site_startedAt_idx" ON "ScrapeRun"("site", "startedAt");

-- AddForeignKey
ALTER TABLE "ListingSpec" ADD CONSTRAINT "ListingSpec_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSpec" ADD CONSTRAINT "ListingSpec_specKeyId_fkey" FOREIGN KEY ("specKeyId") REFERENCES "SpecKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSource" ADD CONSTRAINT "ListingSource_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedListing" ADD CONSTRAINT "SavedListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAlert" ADD CONSTRAINT "PriceAlert_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
