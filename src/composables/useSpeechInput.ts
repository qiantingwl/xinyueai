import { onUnmounted, ref } from 'vue'

type SpeechRecognizer = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognizerConstructor = new () => SpeechRecognizer

export function useSpeechInput(options: {
  onTranscript: (text: string) => void
  onUnsupported?: (message: string) => void
  onError?: (message: string) => void
}) {
  const listening = ref(false)
  const recognizer = ref<SpeechRecognizer | null>(null)

  function stop() {
    recognizer.value?.stop()
  }

  function toggle() {
    if (listening.value) {
      stop()
      return
    }
    const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognizerConstructor; webkitSpeechRecognition?: SpeechRecognizerConstructor }
    const Constructor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Constructor) {
      options.onUnsupported?.('当前浏览器不支持语音输入，请使用 Chrome 或 Edge')
      return
    }
    const instance = new Constructor()
    instance.lang = document.documentElement.lang.startsWith('en') ? 'en-US' : 'zh-CN'
    instance.interimResults = false
    instance.continuous = false
    instance.onresult = (event) => {
      const transcript = Object.values(event.results).map((result) => result[0]?.transcript || '').join('').trim()
      if (transcript) options.onTranscript(transcript)
    }
    instance.onend = () => { listening.value = false; recognizer.value = null }
    instance.onerror = () => {
      listening.value = false
      recognizer.value = null
      options.onError?.('语音输入没有获得麦克风权限')
    }
    recognizer.value = instance
    listening.value = true
    try { instance.start() }
    catch {
      listening.value = false
      recognizer.value = null
      options.onError?.('语音输入启动失败')
    }
  }

  onUnmounted(() => { recognizer.value?.stop(); recognizer.value = null })

  return { listening, toggle, stop }
}
