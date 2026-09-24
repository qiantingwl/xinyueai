-- 助手头像(bloub 小球)外观自定义: 启用开关 / 形态风格 / 配色
ALTER TABLE "SystemSetting" ADD COLUMN "chatAvatarEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SystemSetting" ADD COLUMN "chatAvatarStyle" TEXT NOT NULL DEFAULT 'classic';
ALTER TABLE "SystemSetting" ADD COLUMN "chatAvatarColor" TEXT NOT NULL DEFAULT 'auto';
