-- Remove catalog placeholders that do not have an executable API contract.
DELETE FROM "ToolDefinition"
WHERE "kind" = 'CONNECTOR'
  AND "key" IN ('qichacha', 'tianyancha', 'trip', 'jinshuju');
