/** 文件体积展示。小于 1 KB 按字节，小于 1 MB 按 KB，其余按 MB。 */
export function formatFileSize(bytes: number | null | undefined) {
  const size = Number(bytes || 0)
  if (size < 1024) return `${Math.max(0, Math.round(size))} B`
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
