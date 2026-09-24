/**
 * 全站复制的唯一入口。此前 9 处各写一遍，其中只有一处带非安全上下文的兜底，
 * 其余在 HTTP 或旧浏览器下会静默失败。
 */
export async function copyText(value: string) {
  if (!value) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // 权限被拒或非安全上下文时继续走下面的兜底。
  }
  return legacyCopy(value)
}

/** `navigator.clipboard` 在非 HTTPS 部署下不可用，此时退回选区复制。 */
function legacyCopy(value: string) {
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.top = '0'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  let copied = false
  try { copied = document.execCommand('copy') } catch { copied = false }
  input.remove()
  return copied
}
