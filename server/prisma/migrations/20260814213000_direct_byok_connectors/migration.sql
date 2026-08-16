-- Direct BYOK connectors: users supply their own credentials; Xinyue only
-- stores them encrypted and applies the fixed provider request contract.
INSERT INTO "ToolDefinition" (
  "id", "key", "name", "description", "icon", "kind", "authType",
  "documentationUrl", "credentialFields", "endpoint", "httpMethod",
  "timeoutMs", "headers", "inputSchema", "encryptedHeaders", "enabled",
  "requiresApproval", "createdAt", "updatedAt"
) VALUES
('connector_github', 'github', 'GitHub', '搜索仓库、Issue 和 Pull Request，辅助代码调研与项目协作。', 'https://cdn.simpleicons.org/github', 'CONNECTOR', 'API_KEY', 'https://docs.github.com/rest', '[{"key":"token","label":"Personal Access Token","type":"password","placeholder":"github_pat_...","required":true,"location":"header","target":"Authorization","prefix":"Bearer "}]', 'https://api.github.com/search/issues', 'GET', 45000, '{"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}', '{"type":"object","required":["q"],"properties":{"q":{"type":"string","description":"GitHub 搜索语法"},"sort":{"type":"string"},"order":{"type":"string"},"per_page":{"type":"integer"}}}', '', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('connector_gitee', 'gitee', 'Gitee', '搜索 Gitee 代码仓库，获取开源项目和仓库资料。', 'https://cdn.simpleicons.org/gitee/C71D23', 'CONNECTOR', 'API_KEY', 'https://gitee.com/api/v5/swagger', '[{"key":"accessToken","label":"私人令牌","type":"password","required":true,"location":"query","target":"access_token"}]', 'https://gitee.com/api/v5/search/repositories', 'GET', 45000, '{}', '{"type":"object","required":["q"],"properties":{"q":{"type":"string"},"page":{"type":"integer"},"per_page":{"type":"integer"},"order":{"type":"string"}}}', '', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('connector_supabase', 'supabase', 'Supabase', '查看用户有权访问的 Supabase 项目及其基础状态。', 'https://cdn.simpleicons.org/supabase/3FCF8E', 'CONNECTOR', 'API_KEY', 'https://supabase.com/docs/reference/api/introduction', '[{"key":"accessToken","label":"Access Token","type":"password","required":true,"location":"header","target":"Authorization","prefix":"Bearer "}]', 'https://api.supabase.com/v1/projects', 'GET', 45000, '{}', '{"type":"object","properties":{}}', '', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('connector_neon', 'neon', 'Neon', '查看 Neon Postgres 项目、区域和数据库分支信息。', 'https://cdn.simpleicons.org/neon/00E599', 'CONNECTOR', 'API_KEY', 'https://api-docs.neon.tech/reference/getting-started-with-neon-api', '[{"key":"apiKey","label":"API Key","type":"password","required":true,"location":"header","target":"Authorization","prefix":"Bearer "}]', 'https://console.neon.tech/api/v2/projects', 'GET', 45000, '{}', '{"type":"object","properties":{"limit":{"type":"integer"},"search":{"type":"string"}}}', '', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('connector_wolfram', 'wolfram', 'Wolfram Alpha', '执行数学、科学和事实计算，返回可验证的精确结果。', 'https://cdn.simpleicons.org/wolfram/FF6600', 'CONNECTOR', 'API_KEY', 'https://products.wolframalpha.com/short-answers-api/documentation', '[{"key":"appId","label":"App ID","type":"password","required":true,"location":"query","target":"appid"}]', 'https://api.wolframalpha.com/v1/result', 'GET', 45000, '{}', '{"type":"object","required":["i"],"properties":{"i":{"type":"string","description":"需要计算或查询的问题"},"units":{"type":"string"}}}', '', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('connector_tavily', 'tavily', 'Tavily Search', '面向 AI Agent 的网页搜索与资料检索服务。', 'https://cdn.simpleicons.org/tavily', 'CONNECTOR', 'API_KEY', 'https://docs.tavily.com/documentation/api-reference/endpoint/search', '[{"key":"apiKey","label":"API Key","type":"password","placeholder":"tvly-...","required":true,"location":"header","target":"Authorization","prefix":"Bearer "}]', 'https://api.tavily.com/search', 'POST', 45000, '{}', '{"type":"object","required":["query"],"properties":{"query":{"type":"string"},"search_depth":{"type":"string"},"max_results":{"type":"integer"},"include_answer":{"type":"boolean"}}}', '', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('connector_bocha', 'bocha', '博查 AI 搜索', '检索公开网页、新闻和资料，为 Agent 返回结构化搜索结果。', 'search', 'CONNECTOR', 'API_KEY', 'https://open.bochaai.com/', '[{"key":"apiKey","label":"API Key","type":"password","required":true,"location":"header","target":"Authorization","prefix":"Bearer "}]', 'https://api.bochaai.com/v1/web-search', 'POST', 45000, '{}', '{"type":"object","required":["query"],"properties":{"query":{"type":"string"},"freshness":{"type":"string"},"summary":{"type":"boolean"},"count":{"type":"integer"}}}', '', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

UPDATE "ToolDefinition" SET
  "icon" = 'https://cdn.simpleicons.org/gamma',
  "endpoint" = 'https://public-api.gamma.app/v0.2/generations',
  "httpMethod" = 'POST',
  "inputSchema" = '{"type":"object","required":["inputText"],"properties":{"inputText":{"type":"string"},"textMode":{"type":"string"},"format":{"type":"string"},"numCards":{"type":"integer"}}}',
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'gamma' AND "endpoint" = '';

UPDATE "ToolDefinition" SET
  "icon" = 'https://cdn.simpleicons.org/stripe/635BFF',
  "endpoint" = 'https://api.stripe.com/v1/balance',
  "httpMethod" = 'GET',
  "inputSchema" = '{"type":"object","properties":{}}',
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'stripe' AND "endpoint" = '';

UPDATE "ToolDefinition" SET
  "icon" = 'https://cdn.simpleicons.org/hubspot/FF7A59',
  "endpoint" = 'https://api.hubapi.com/crm/v3/objects/contacts/search',
  "httpMethod" = 'POST',
  "authType" = 'API_KEY',
  "credentialFields" = '[{"key":"accessToken","label":"Private App Access Token","type":"password","required":true,"location":"header","target":"Authorization","prefix":"Bearer "}]',
  "inputSchema" = '{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer"},"properties":{"type":"array"},"filterGroups":{"type":"array"}}}',
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'hubspot' AND "endpoint" = '';

UPDATE "ToolDefinition" SET
  "endpoint" = 'https://restapi.amap.com/v3/place/text',
  "httpMethod" = 'GET',
  "inputSchema" = '{"type":"object","required":["keywords"],"properties":{"keywords":{"type":"string"},"city":{"type":"string"},"types":{"type":"string"},"page":{"type":"integer"},"offset":{"type":"integer"}}}',
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'amap' AND "endpoint" = '';

UPDATE "ToolDefinition" SET
  "endpoint" = 'https://apis.map.qq.com/ws/place/v1/search',
  "httpMethod" = 'GET',
  "inputSchema" = '{"type":"object","required":["keyword","boundary"],"properties":{"keyword":{"type":"string"},"boundary":{"type":"string","description":"例如 region(北京,0)"},"page_size":{"type":"integer"},"page_index":{"type":"integer"}}}',
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'tencent-map' AND "endpoint" = '';
