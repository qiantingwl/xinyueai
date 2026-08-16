ALTER TABLE "ToolDefinition"
ADD COLUMN "icon" TEXT NOT NULL DEFAULT 'wrench',
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'BUILT_IN',
ADD COLUMN "authType" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "authorizationUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "documentationUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "credentialFields" JSONB;

CREATE TABLE "ConnectorCredential" (
  "userId" TEXT NOT NULL,
  "toolId" TEXT NOT NULL,
  "encryptedCredentials" TEXT NOT NULL,
  "credentialHints" JSONB,
  "status" TEXT NOT NULL DEFAULT 'CONNECTED',
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectorCredential_pkey" PRIMARY KEY ("userId", "toolId")
);

CREATE INDEX "ConnectorCredential_toolId_status_idx" ON "ConnectorCredential"("toolId", "status");
ALTER TABLE "ConnectorCredential" ADD CONSTRAINT "ConnectorCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectorCredential" ADD CONSTRAINT "ConnectorCredential_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
