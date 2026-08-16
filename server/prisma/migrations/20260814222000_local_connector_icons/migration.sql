UPDATE "ToolDefinition" SET "icon" = CASE "key"
  WHEN 'gamma' THEN '/connectors/gamma.png'
  WHEN 'github' THEN '/connectors/github.svg'
  WHEN 'gitee' THEN '/connectors/gitee.svg'
  WHEN 'hubspot' THEN '/connectors/hubspot.svg'
  WHEN 'neon' THEN '/connectors/neon.svg'
  WHEN 'stripe' THEN '/connectors/stripe.svg'
  WHEN 'supabase' THEN '/connectors/supabase.svg'
  WHEN 'tavily' THEN '/connectors/tavily.png'
  WHEN 'wolfram' THEN '/connectors/wolfram.svg'
  WHEN 'bocha' THEN '/connectors/bocha.png'
  WHEN 'tencent-map' THEN '/connectors/tencent_map.png'
  WHEN 'amap' THEN '/connectors/amap.png'
  ELSE "icon"
END, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('gamma', 'github', 'gitee', 'hubspot', 'neon', 'stripe', 'supabase', 'tavily', 'wolfram', 'bocha', 'tencent-map', 'amap');

UPDATE "ToolDefinition" SET "documentationUrl" = CASE "key"
  WHEN 'gamma' THEN 'https://developers.gamma.app/docs/authentication'
  WHEN 'github' THEN 'https://github.com/settings/tokens?type=beta'
  WHEN 'gitee' THEN 'https://gitee.com/profile/personal_access_tokens'
  WHEN 'hubspot' THEN 'https://app.hubspot.com/private-apps'
  WHEN 'neon' THEN 'https://console.neon.tech/app/settings/api-keys'
  WHEN 'stripe' THEN 'https://dashboard.stripe.com/apikeys'
  WHEN 'supabase' THEN 'https://supabase.com/dashboard/account/tokens'
  WHEN 'tavily' THEN 'https://app.tavily.com/home'
  WHEN 'wolfram' THEN 'https://developer.wolframalpha.com/access'
  WHEN 'bocha' THEN 'https://open.bochaai.com/console/'
  WHEN 'tencent-map' THEN 'https://lbs.qq.com/dev/console/application/mine'
  WHEN 'amap' THEN 'https://console.amap.com/dev/key/app'
  ELSE "documentationUrl"
END, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('gamma', 'github', 'gitee', 'hubspot', 'neon', 'stripe', 'supabase', 'tavily', 'wolfram', 'bocha', 'tencent-map', 'amap');
