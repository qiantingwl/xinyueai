const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'object',
  'embed',
  'link',
  'base',
  'meta',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'foreignobject',
  'animate',
  'set'
])

const ALLOWED_HTML_TAGS = new Set([
  'p',
  'br',
  'div',
  'span',
  'section',
  'article',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'mark',
  'a',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'figure',
  'figcaption',
  'sub',
  'sup'
])

const ALLOWED_HTML_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan'])
}

const SAFE_URI_PATTERN = /^(?:(?:https?|mailto|tel):|\/|#|\.\/)/i

function isSafeUri(value: string) {
  return SAFE_URI_PATTERN.test(value.trim())
}

export function sanitizeHtml(rawHtml: string): string {
  if (typeof window === 'undefined' || !rawHtml) return ''
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawHtml, 'text/html')
    const elements = Array.from(doc.body.querySelectorAll('*')).reverse()
    for (const el of elements) {
      const tagName = el.tagName.toLowerCase()
      if (DANGEROUS_TAGS.has(tagName) || !ALLOWED_HTML_TAGS.has(tagName)) {
        if (DANGEROUS_TAGS.has(tagName)) el.remove()
        else el.replaceWith(...Array.from(el.childNodes))
        continue
      }
      const allowed = ALLOWED_HTML_ATTRS[tagName] || new Set<string>()
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim()
        if (!allowed.has(name) || name.startsWith('on') || name === 'formaction') {
          el.removeAttribute(attr.name)
          continue
        }
        if ((name === 'href' || name === 'src') && !isSafeUri(value)) {
          el.removeAttribute(attr.name)
        }
      }
      if (tagName === 'a' && el.getAttribute('target') === '_blank') {
        el.setAttribute('rel', 'noopener noreferrer')
      }
    }
    return doc.body.innerHTML
  } catch {
    return ''
  }
}

export function isTrustedAssetSrc(src: string) {
  if (!src) return false
  if (src.startsWith('/') || src.startsWith('./')) return true
  try {
    return new URL(src, window.location.origin).origin === window.location.origin
  } catch {
    return false
  }
}

export function sanitizeSvg(rawSvg: string): string {
  if (typeof window === 'undefined' || !rawSvg) return ''
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawSvg, 'image/svg+xml')
    const parserError = doc.querySelector('parsererror')
    if (parserError) return ''
    const elements = Array.from(doc.querySelectorAll('*'))
    for (const el of elements) {
      const tagName = el.tagName.toLowerCase().replace(/^[^:]+:/, '')
      if (DANGEROUS_TAGS.has(tagName)) {
        el.remove()
        continue
      }
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim().toLowerCase()
        if (name.startsWith('on') || name === 'formaction') {
          el.removeAttribute(attr.name)
          continue
        }
        if ((name === 'href' || name.endsWith(':href')) && !isSafeUri(value)) {
          el.removeAttribute(attr.name)
        }
      }
    }
    const rootSvg = doc.querySelector('svg')
    return rootSvg ? rootSvg.outerHTML : ''
  } catch {
    return ''
  }
}
