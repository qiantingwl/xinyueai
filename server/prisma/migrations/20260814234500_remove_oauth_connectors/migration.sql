-- OAuth connectors require platform applications and provider approval.
-- Xinyue currently exposes only connectors users can configure themselves.
DELETE FROM "ToolDefinition"
WHERE "kind" = 'CONNECTOR'
  AND "authType" = 'OAUTH2';

ALTER TABLE "ToolDefinition"
DROP COLUMN "authorizationUrl";
