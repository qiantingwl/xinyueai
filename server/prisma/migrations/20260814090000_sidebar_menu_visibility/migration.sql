ALTER TABLE "SystemSetting"
ADD COLUMN "sidebarCreationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sidebarCommerceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sidebarOfficeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sidebarPromptsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sidebarPluginsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sidebarProjectsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sidebarAssetsEnabled" BOOLEAN NOT NULL DEFAULT true;
