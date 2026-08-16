UPDATE "ToolDefinition" SET "icon" = CASE "key"
  WHEN 'github' THEN 'https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/github.svg'
  WHEN 'gitee' THEN 'https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/gitee.svg'
  WHEN 'supabase' THEN 'https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/supabase.svg'
  WHEN 'wolfram' THEN 'https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/wolfram.svg'
  WHEN 'stripe' THEN 'https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/stripe.svg'
  WHEN 'hubspot' THEN 'https://cdn.jsdelivr.net/npm/simple-icons@15.16.0/icons/hubspot.svg'
  WHEN 'tavily' THEN 'https://tavily.com/favicon.ico'
  WHEN 'gamma' THEN 'presentation'
  WHEN 'neon' THEN 'database'
  ELSE "icon"
END, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('github', 'gitee', 'supabase', 'wolfram', 'stripe', 'hubspot', 'tavily', 'gamma', 'neon');
