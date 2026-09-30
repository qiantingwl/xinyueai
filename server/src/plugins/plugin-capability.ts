const chatPluginFallbacks = ['CHAT', 'OFFICE', 'IMAGE', 'COMMERCE', 'VIDEO'] as const

export type ChatPluginCapability = (typeof chatPluginFallbacks)[number]

export function matchPluginCapability<T extends string>(requested: T, capabilities: T[], fallbacks: T[] = []) {
  return [requested, ...fallbacks].find((item) => capabilities.includes(item))
}

export function chatPluginCapabilityFallbacks(requested: ChatPluginCapability): ChatPluginCapability[] {
  return chatPluginFallbacks.filter((item) => item !== requested)
}
