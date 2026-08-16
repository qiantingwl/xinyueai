CREATE TABLE "ProjectMember" (
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE INDEX "ProjectMember_userId_joinedAt_idx" ON "ProjectMember"("userId", "joinedAt");

ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD COLUMN "authorId" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

UPDATE "Message" AS message
SET "authorId" = conversation."userId"
FROM "Conversation" AS conversation
WHERE message."conversationId" = conversation."id" AND message."role" = 'USER';

CREATE INDEX "Message_authorId_createdAt_idx" ON "Message"("authorId", "createdAt");
CREATE INDEX "Message_deletedAt_idx" ON "Message"("deletedAt");

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Message_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD COLUMN "skillRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "activeSkillVersionId" TEXT;

CREATE TYPE "ProjectSkillChangeType" AS ENUM ('MANUAL', 'SUMMARY', 'RESTORE', 'DISABLE');

CREATE TABLE "ProjectSkillVersion" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "changeType" "ProjectSkillChangeType" NOT NULL,
  "changeSummary" TEXT NOT NULL DEFAULT '',
  "previousVersionId" TEXT,
  "sourceConversationId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectSkillVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_activeSkillVersionId_key" ON "Project"("activeSkillVersionId");
CREATE UNIQUE INDEX "ProjectSkillVersion_projectId_version_key" ON "ProjectSkillVersion"("projectId", "version");
CREATE INDEX "ProjectSkillVersion_projectId_createdAt_idx" ON "ProjectSkillVersion"("projectId", "createdAt");
CREATE INDEX "ProjectSkillVersion_createdById_createdAt_idx" ON "ProjectSkillVersion"("createdById", "createdAt");
CREATE INDEX "ProjectSkillVersion_sourceConversationId_idx" ON "ProjectSkillVersion"("sourceConversationId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_activeSkillVersionId_fkey" FOREIGN KEY ("activeSkillVersionId") REFERENCES "ProjectSkillVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectSkillVersion" ADD CONSTRAINT "ProjectSkillVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSkillVersion" ADD CONSTRAINT "ProjectSkillVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "ProjectSkillVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectSkillVersion" ADD CONSTRAINT "ProjectSkillVersion_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectSkillVersion" ADD CONSTRAINT "ProjectSkillVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
