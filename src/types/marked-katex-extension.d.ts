declare module 'marked-katex-extension' {
  import type { MarkedExtension } from 'marked'

  interface MarkedKatexOptions {
    throwOnError?: boolean
    nonStandard?: boolean
    output?: 'html' | 'mathml' | 'htmlAndMathml'
    displayMode?: boolean
    [key: string]: unknown
  }

  export default function markedKatex(options?: MarkedKatexOptions): MarkedExtension
}
