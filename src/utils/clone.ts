import { isProxy, toRaw } from 'vue'

/**
 * 统一深克隆入口。此前画布编辑器、历史栈各自内联 `JSON.parse(JSON.stringify(...))`，
 * 慢且丢 undefined/Date。structuredClone 比 JSON 往返快数倍，但克隆到 Vue 的
 * reactive proxy 会抛 DataCloneError，而 toRaw 只解最外层——Vue Flow 回写节点时
 * 可能在更深处塞进代理对象。所以先把整棵树里的代理逐层展开成裸容器，再交给
 * structuredClone；非普通对象（Date/Map/Set 等）本身就是裸的，原生克隆直接支持。
 */
export function clone<T>(value: T): T {
  if (typeof structuredClone !== 'function') return JSON.parse(JSON.stringify(value)) as T
  return structuredClone(deepToRaw(value)) as T
}

function deepToRaw<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
  if (isProxy(value)) return deepToRaw(toRaw(value) as T, seen)
  if (value === null || typeof value !== 'object') return value
  const source = value as unknown as object
  if (seen.has(source)) return seen.get(source) as T
  if (Array.isArray(source)) {
    const out: unknown[] = []
    seen.set(source, out)
    source.forEach((item, index) => { out[index] = deepToRaw(item, seen) })
    return out as unknown as T
  }
  const proto = Object.getPrototypeOf(source)
  if (proto !== Object.prototype && proto !== null) return value
  const out: Record<string, unknown> = {}
  seen.set(source, out)
  for (const key of Object.keys(source)) out[key] = deepToRaw((source as Record<string, unknown>)[key], seen)
  return out as unknown as T
}
