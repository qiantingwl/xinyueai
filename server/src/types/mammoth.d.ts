declare module 'mammoth' {
  interface ExtractRawTextOptions {
    buffer?: Buffer | ArrayBuffer
    path?: string
  }
  interface ExtractionResult {
    value: string
    messages: unknown[]
  }
  export function extractRawText(options: ExtractRawTextOptions): Promise<ExtractionResult>
}
