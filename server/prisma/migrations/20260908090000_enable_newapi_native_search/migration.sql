-- NewAPI-compatible gateways can expose the OpenAI Responses web-search tool.
-- Keep an explicitly different provider setting untouched; migrate only the
-- default disabled value that was created by the NewAPI template.
UPDATE "ProviderTemplate"
SET "nativeSearchProvider" = 'openai'
WHERE "key" = 'newapi'
  AND "nativeSearchProvider" = 'disabled';

UPDATE "ProviderChannel" AS channel
SET "metadata" = jsonb_set(
  COALESCE(channel."metadata", '{}'::jsonb),
  '{nativeSearchProvider}',
  '"openai"'::jsonb,
  true
)
FROM "ProviderTemplate" AS template
WHERE channel."templateId" = template."id"
  AND template."key" = 'newapi'
  AND channel."type" = 'NEW_API'
  AND (
    channel."metadata" IS NULL
    OR channel."metadata"->>'nativeSearchProvider' = 'disabled'
  );
