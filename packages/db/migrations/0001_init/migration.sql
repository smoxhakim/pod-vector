-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro', 'studio');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'processing', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('source', 'cleaned', 'vector', 'cmyk_preview', 'editor_export', 'final_export');

-- CreateEnum
CREATE TYPE "AssetFormat" AS ENUM ('png', 'jpg', 'webp', 'svg', 'pdf', 'eps', 'tiff');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('cleanup', 'background_removal', 'vectorize', 'cmyk_convert', 'validate', 'export', 'ai_upscale', 'mockup_generate', 'integration_push');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('queued', 'processing', 'completed', 'completed_with_errors');

-- CreateEnum
CREATE TYPE "BatchItemStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'overridden');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "vectorizationsCount" INTEGER NOT NULL DEFAULT 0,
    "aiCallsCount" INTEGER NOT NULL DEFAULT 0,
    "exportsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productType" TEXT,
    "tags" TEXT[],
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "vectorizationSettings" JSONB,
    "cleanupSettings" JSONB,
    "backgroundSettings" JSONB,
    "colorSettings" JSONB,
    "printSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "format" "AssetFormat" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "dpi" INTEGER,
    "colorMode" TEXT,
    "fileSizeBytes" INTEGER,
    "isTrueVector" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "batchItemId" TEXT,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "params" JSONB,
    "resultAssetId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationResult" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "checks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "iccFileUrl" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ColorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PODPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "dpi" INTEGER NOT NULL,
    "bleed" DOUBLE PRECISION,
    "safeArea" JSONB,
    "colorProfileId" TEXT,
    "background" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PODPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorState" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "canvasJSON" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'queued',
    "settings" JSONB,
    "totalFiles" INTEGER NOT NULL,
    "completedFiles" INTEGER NOT NULL DEFAULT 0,
    "failedFiles" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchItem" (
    "id" TEXT NOT NULL,
    "batchJobId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "BatchItemStatus" NOT NULL DEFAULT 'queued',

    CONSTRAINT "BatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "externalShopId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationPush" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "externalProductId" TEXT,
    "status" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3),

    CONSTRAINT "IntegrationPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_userId_period_key" ON "UsageCounter"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentVersionId_key" ON "Project"("currentVersionId");

-- CreateIndex
CREATE INDEX "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_projectId_versionNumber_key" ON "ProjectVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_versionId_type_idx" ON "Asset"("versionId", "type");

-- CreateIndex
CREATE INDEX "Job_projectId_createdAt_idx" ON "Job"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ValidationResult_versionId_createdAt_idx" ON "ValidationResult"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "PODPreset_userId_idx" ON "PODPreset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorState_versionId_key" ON "EditorState"("versionId");

-- CreateIndex
CREATE INDEX "BatchJob_userId_idx" ON "BatchJob"("userId");

-- CreateIndex
CREATE INDEX "BatchItem_batchJobId_orderIndex_idx" ON "BatchItem"("batchJobId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_provider_key" ON "Integration"("userId", "provider");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageCounter" ADD CONSTRAINT "UsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_batchItemId_fkey" FOREIGN KEY ("batchItemId") REFERENCES "BatchItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_resultAssetId_fkey" FOREIGN KEY ("resultAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PODPreset" ADD CONSTRAINT "PODPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PODPreset" ADD CONSTRAINT "PODPreset_colorProfileId_fkey" FOREIGN KEY ("colorProfileId") REFERENCES "ColorProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorState" ADD CONSTRAINT "EditorState_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchJob" ADD CONSTRAINT "BatchJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_batchJobId_fkey" FOREIGN KEY ("batchJobId") REFERENCES "BatchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPush" ADD CONSTRAINT "IntegrationPush_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPush" ADD CONSTRAINT "IntegrationPush_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

