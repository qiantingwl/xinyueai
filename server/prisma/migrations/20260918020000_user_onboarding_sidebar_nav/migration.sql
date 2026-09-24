ALTER TABLE "UserSettings" ADD COLUMN "onboarded" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "UserSettings" ADD COLUMN "sidebarNav" JSONB;
