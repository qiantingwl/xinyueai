/**
 * Prisma Json 列与外部 JSON 的统一收窄：只有「非空、非数组的对象」才当作 record，
 * 其余（null、数组、标量）都退化为空对象，调用方可以直接取属性而不必层层判空。
 */
export function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
