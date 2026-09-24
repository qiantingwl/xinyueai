-- 聊天助手头像动效模式：ambient 常驻轮动 / active 仅生成时 / off 静态
ALTER TABLE "SystemSetting" ADD COLUMN "chatAvatarMotion" TEXT NOT NULL DEFAULT 'ambient';
