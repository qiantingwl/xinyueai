UPDATE "ToolDefinition" SET "icon" = CASE "key"
  WHEN 'qichacha' THEN '/connectors/qichacha.ico'
  WHEN 'tianyancha' THEN '/connectors/tianyancha.ico'
  WHEN 'notion' THEN '/connectors/notion.svg'
  WHEN 'google-workspace' THEN '/connectors/google_workspace.svg'
  WHEN 'dingtalk' THEN '/connectors/dingtalk.ico'
  WHEN 'wecom' THEN '/connectors/wecom.svg'
  WHEN 'feishu' THEN '/connectors/feishu.ico'
  WHEN 'tencent-docs' THEN '/connectors/tencent_docs.ico'
  WHEN 'wps-docs' THEN '/connectors/wps.ico'
  WHEN 'trip' THEN '/connectors/trip.svg'
  WHEN 'jinshuju' THEN '/connectors/jinshuju.ico'
  ELSE "icon"
END, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN (
  'qichacha',
  'tianyancha',
  'notion',
  'google-workspace',
  'dingtalk',
  'wecom',
  'feishu',
  'tencent-docs',
  'wps-docs',
  'trip',
  'jinshuju'
);
