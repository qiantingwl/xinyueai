export function hasSupportedImageSignature(bytes: Uint8Array) {
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString('ascii')
  return (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG')
    || (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8)
    || (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
    || (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6)))
}

export function remoteModelIds(payload: unknown) {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record.data
      : Array.isArray(record?.models)
        ? record.models
        : []
  return [...new Set(source.map((item) => {
    if (typeof item === 'string') return item
    if (!item || typeof item !== 'object' || Array.isArray(item)) return ''
    const row = item as { id?: unknown; name?: unknown }
    return typeof row.id === 'string' ? row.id : typeof row.name === 'string' ? row.name : ''
  }).filter(Boolean))].sort()
}
