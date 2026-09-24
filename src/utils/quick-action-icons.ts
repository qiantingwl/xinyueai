import type { Component } from 'vue'
import { BriefcaseBusiness, Code2, FileText, Globe2, Image as ImageIcon, Languages, Mic, Music2, Presentation, Search, Sparkles, Table2, Video, WandSparkles } from 'lucide-vue-next'

const quickActionIcons: Record<string, Component> = {
  sparkles: Sparkles,
  video: Video,
  music: Music2,
  image: ImageIcon,
  podcast: Mic,
  table: Table2,
  writing: FileText,
  transcribe: Mic,
  ppt: Presentation,
  translate: Languages,
  research: Search,
  answer: FileText,
  code: Code2,
  document: FileText,
  website: Globe2,
  design: WandSparkles,
  office: BriefcaseBusiness,
}

export const quickActionIcon = (name: string) => quickActionIcons[name] || Sparkles
