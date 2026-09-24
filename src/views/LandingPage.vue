<template>
  <div class="landing-page" :data-mode="activeMode + 1">
    <a class="landing-skip" href="#main-content">跳到主要内容</a>

    <header class="landing-header" :class="{ 'is-scrolled': headerScrolled }">
      <RouterLink class="landing-brand" to="/" aria-label="Xinyue AI 首页">
        <span class="landing-brand__mark">X</span>
        <strong>Xinyue AI</strong>
      </RouterLink>

      <nav class="landing-nav" aria-label="主要导航">
        <a href="#intro">简介</a>
        <div v-for="group in navGroups" :key="group.key" class="landing-nav-menu">
          <button type="button" :aria-expanded="openNavMenu === group.key" @click.stop="toggleNavMenu(group.key)">
            {{ group.label }} <ChevronDown :size="14" />
          </button>
          <div v-if="openNavMenu === group.key" class="landing-nav-panel">
            <RouterLink v-for="item in group.items" :key="item.label" :to="item.to" @click="openNavMenu = null">
              <strong>{{ item.label }}</strong>
              <span>{{ item.description }}</span>
            </RouterLink>
          </div>
        </div>
        <a href="#plans">定价</a>
      </nav>

      <div class="landing-header__actions">
        <RouterLink class="landing-header__login" to="/login?redirect=/chat">登录</RouterLink>
        <RouterLink class="landing-header__start" to="/chat">免费开始</RouterLink>
      </div>

      <button class="landing-mobile-toggle" type="button" :aria-label="mobileMenuOpen ? '关闭导航' : '打开导航'" @click="mobileMenuOpen = !mobileMenuOpen">
        <X v-if="mobileMenuOpen" :size="22" />
        <Menu v-else :size="22" />
      </button>
    </header>

    <div v-if="mobileMenuOpen" class="landing-mobile-menu">
      <a href="#intro" @click="mobileMenuOpen = false">简介</a>
      <details v-for="group in navGroups" :key="group.key">
        <summary>{{ group.label }} <ChevronDown :size="17" /></summary>
        <div>
          <RouterLink v-for="item in group.items" :key="item.label" :to="item.to" @click="mobileMenuOpen = false">
            {{ item.label }} <ArrowUpRight :size="16" />
          </RouterLink>
        </div>
      </details>
      <a href="#plans" @click="mobileMenuOpen = false">定价</a>
      <RouterLink class="landing-mobile-menu__login" to="/login?redirect=/chat" @click="mobileMenuOpen = false">登录</RouterLink>
    </div>

    <main id="main-content" tabindex="-1">
      <section id="intro" class="landing-overview">
        <div class="landing-overview__copy">
          <h1>
            <span class="landing-title-lead">{{ landing.heroLead }}</span>
            <span class="landing-title-modes">
              <button type="button" class="mode-chat" :class="{ 'is-active': activeMode === 0 }" :aria-pressed="activeMode === 0" @pointerenter="previewMode(0)" @focus="previewMode(0)" @click="selectMode(0)"><span>{{ modes[0]?.title }}</span><i></i></button><b>、</b>
              <button type="button" class="mode-image" :class="{ 'is-active': activeMode === 1 }" :aria-pressed="activeMode === 1" @pointerenter="previewMode(1)" @focus="previewMode(1)" @click="selectMode(1)"><span>{{ modes[1]?.title }}</span><i></i></button><span class="landing-title-tail"><b>和</b><button type="button" class="mode-product" :class="{ 'is-active': activeMode === 2 }" :aria-pressed="activeMode === 2" @pointerenter="previewMode(2)" @focus="previewMode(2)" @click="selectMode(2)"><span>{{ modes[2]?.title }}</span><i></i></button><b>。</b></span>
            </span>
          </h1>

          <div class="landing-hero-actions">
            <RouterLink class="landing-button landing-button--primary" to="/chat">免费开始 <ArrowRight :size="17" /></RouterLink>
            <a class="landing-button landing-button--text" href="#capabilities">查看平台能力 <ArrowRight :size="17" /></a>
          </div>
        </div>

        <div ref="story" class="landing-journey" :class="{ 'is-expanded': journeyExpanded }" :style="journeyStyle">
          <span id="capabilities" class="landing-journey__anchor" aria-hidden="true"></span>
          <div class="landing-journey__sticky">
            <div class="landing-art" aria-hidden="true">
              <div class="landing-art-scene art-chat">
                <div class="art-fruit"><i></i></div>
                <Asterisk class="art-star art-star--left" :size="78" :stroke-width="2.5" />
                <span class="art-cloud"></span>
                <Asterisk class="art-star art-star--right" :size="82" :stroke-width="2.5" />
                <div class="art-flower"><i v-for="n in 5" :key="n"></i><b></b></div>
                <span class="art-wave"></span>
              </div>
              <div class="landing-art-scene art-image">
                <span class="art-orb"></span><Asterisk class="art-star art-star--left" :size="78" />
                <span class="art-leaves"></span><span class="art-spark"></span><span class="art-fold"></span><span class="art-wave art-wave--color"></span>
              </div>
              <div class="landing-art-scene art-product">
                <span class="art-bottle"></span><Asterisk class="art-star art-star--left" :size="78" />
                <span class="art-dot"></span><span class="art-spark"></span><span class="art-box"></span><span class="art-growth"></span>
              </div>
            </div>

            <div class="landing-preview">
              <figure v-for="(mode, index) in modes" :key="mode.key" :class="{ 'is-active': activeMode === index }">
                <img :src="mode.image" :alt="mode.imageAlt" />
                <div class="preview-browser-mask">
                  <span class="preview-dots"><i></i><i></i><i></i></span>
                  <span>Xinyue AI</span>
                  <small>xinyue.ai/{{ mode.path }}</small>
                </div>
                <div class="preview-sidebar-mask">
                  <strong><span>X</span> Xinyue AI</strong>
                  <i v-for="item in previewNav" :key="item">{{ item }}</i>
                </div>
              </figure>
            </div>

            <div class="landing-workflow-tabs">
              <article v-for="(mode, index) in modes" :key="mode.key" :class="{ 'is-active': activeMode === index }">
                <button type="button" :aria-pressed="activeMode === index" @click="activateWorkflow(index)">
                  <span>{{ mode.title }}</span><i><ArrowDown v-if="activeMode === index" :size="17" /><ArrowRight v-else :size="17" /></i>
                </button>
                <div class="landing-workflow-body">
                  <strong>{{ mode.lead }}</strong>
                  <p>{{ mode.description }}</p>
                  <div>
                    <RouterLink v-for="action in mode.actions" :key="action.label" :to="action.to">{{ action.label }} <ArrowRight :size="15" /></RouterLink>
                  </div>
                  <figure class="landing-workflow-mobile-visual">
                    <img :src="mode.image" :alt="mode.imageAlt" />
                  </figure>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section class="landing-section landing-fit landing-reveal">
        <div class="landing-section-heading">
          <h2>{{ landing.trustTitle }}</h2>
          <p>{{ landing.trustDescription }}</p>
        </div>
        <div class="landing-fit-grid">
          <article v-for="item in landing.trustItems" :key="item.title"><h3>{{ item.title }}</h3><p>{{ item.description }}</p></article>
        </div>
      </section>

      <section class="landing-section landing-links landing-reveal">
        <div class="landing-section-heading">
          <h2>{{ landing.linksTitle }}</h2>
          <p>{{ landing.linksDescription }}</p>
        </div>
        <div class="landing-link-list">
          <RouterLink v-for="item in capabilityLinks" :key="item.title" :to="item.to">
            <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span><ArrowUpRight :size="18" />
          </RouterLink>
        </div>
      </section>

      <section class="landing-section landing-faq landing-reveal">
        <h2>{{ landing.faqTitle }}</h2>
        <div>
          <details v-for="item in faqs" :key="item.question">
            <summary>{{ item.question }}<span></span></summary>
            <p>{{ item.answer }}</p>
          </details>
        </div>
      </section>

      <section id="plans" class="landing-final landing-reveal">
        <h2>{{ landing.finalTitle }}</h2>
        <p>{{ landing.finalDescription }}</p>
        <RouterLink class="landing-button landing-button--primary" to="/chat">免费开始 <ArrowRight :size="17" /></RouterLink>
      </section>
    </main>

    <footer class="landing-footer">
      <div class="landing-footer__brand">
        <strong><span>X</span> Xinyue AI</strong>
        <p>{{ landing.footerDescription }}</p>
      </div>
      <div class="landing-footer__groups">
        <section><h2>产品</h2><RouterLink to="/chat">AI 对话</RouterLink><RouterLink to="/image">图片生成</RouterLink><RouterLink to="/commerce">商品素材包</RouterLink><RouterLink to="/commerce">商品详情页</RouterLink></section>
        <section><h2>模型</h2><a href="#capabilities">GPT-5.5</a><a href="#capabilities">GPT Image 2</a><a href="#capabilities">Flux Vision</a></section>
        <section><h2>了解我们</h2><RouterLink to="/about">关于我们</RouterLink><RouterLink to="/copyright">版权说明</RouterLink></section>
        <section><h2>条款与政策</h2><RouterLink to="/terms">用户协议</RouterLink><RouterLink to="/privacy">隐私政策</RouterLink></section>
      </div>
      <p class="landing-footer__copyright">{{ landing.copyright }}</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ArrowDown, ArrowRight, ArrowUpRight, Asterisk, ChevronDown, Menu, X } from 'lucide-vue-next'
import { useCatalogStore, type LandingContent } from '../stores/catalog'

const activeMode = ref(0)
const selectedMode = ref(0)
const openNavMenu = ref<string | null>(null)
const mobileMenuOpen = ref(false)
const headerScrolled = ref(false)
const journeyExpanded = ref(false)
const journeyProgress = ref(0)
const story = ref<HTMLElement | null>(null)
let revealObserver: IntersectionObserver | null = null
let frame = 0

const defaultModes = [
  {
    key: 'chat', title: '对话', path: 'chat', image: '/assets/chat-workspace-white.jpg', imageAlt: 'Xinyue AI 对话工作台预览',
    lead: '先聊清需求、资料和下一步。',
    description: '讨论方案、整理文件、撰写内容或分析图片。项目上下文会保留在同一段工作中，不必每次重新交代背景。',
    actions: [{ label: '开始对话', to: '/chat' }],
  },
  {
    key: 'image', title: '图片创作', path: 'image', image: '/assets/image-studio-white.jpg', imageAlt: 'Xinyue AI 图片创作工作台预览',
    lead: '从描述或参考图开始创作。',
    description: '选择模型、比例和输出数量，生成多张候选并继续编辑，结果自动进入文件库。',
    actions: [{ label: '开始创作', to: '/image' }],
  },
  {
    key: 'product', title: '商品上新', path: 'commerce', image: '/assets/product-visual-white.jpg', imageAlt: 'Xinyue AI 商品视觉工作台预览',
    lead: '从商品资料到成套上新视觉。',
    description: '商品素材包和连续详情页分别规划、分别交付。系统会根据用途规划独立商品图片或连续中文页面，结果统一进入文件库。',
    actions: [{ label: '制作素材包', to: '/commerce' }, { label: '制作详情页', to: '/commerce' }],
  },
]

const defaultNavGroups = [
  { key: 'features', label: '功能', items: [
    { label: 'AI 对话', description: '思考、写作与协作', to: '/chat' },
    { label: '图片生成', description: '生成、编辑与多图创作', to: '/image' },
    { label: '商品素材包', description: '按用途规划一组商品图片', to: '/commerce' },
    { label: '商品详情页', description: '按顺序阅读的连续商品页面', to: '/commerce' },
  ] },
  { key: 'models', label: '模型', items: [
    { label: 'GPT-5.5', description: '复杂任务与深度思考', to: '/chat' },
    { label: 'GPT Image 2', description: '高质量图片生成与编辑', to: '/image' },
    { label: 'Flux Vision', description: '快速视觉探索与多图创作', to: '/image' },
  ] },
]

const defaultPreviewNav = ['新对话', 'AI 创作', '电商中心', '办公中心', '工作空间']
const defaultCapabilityLinks = [
  { title: '图片生成', description: '了解普通图片生成、参考图编辑与多张候选。', to: '/image' },
  { title: '商品素材包', description: '围绕同一商品生成一组各有用途的商品图片。', to: '/commerce' },
  { title: '商品详情页', description: '生成需要按顺序阅读的连续商品介绍。', to: '/commerce' },
  { title: '定价', description: '查看会员方案、适用场景和包含的创作点。', to: '#plans' },
]
const defaultFaqs = [
  { question: '一定要先从 AI 对话开始吗？', answer: '不需要。需求明确时可以直接进入图片创作或商品中心；需要梳理背景、资料和交付标准时，再从对话开始。' },
  { question: '图片生成、商品素材包和商品详情页有什么区别？', answer: '图片生成处理单次视觉任务；商品素材包围绕同一商品规划多张独立用途图片；商品详情页则是按顺序阅读的连续页面。' },
  { question: '商品素材包和商品详情页必须一起生成吗？', answer: '不必。它们是独立任务，可以分别创建、计费、修改和下载。' },
  { question: '只有一张商品图，也可以制作素材包或详情页吗？', answer: '可以。系统会以你提供的商品图和事实信息为基础规划内容，并明确标识还需要补充的资料。' },
  { question: '项目和普通对话有什么区别？', answer: '项目会长期保存对话、文件、生成记录与版本，适合持续性的品牌或商品工作。' },
  { question: '生成的作品保存在哪里？', answer: '所有生成结果都会进入文件库，并可关联到当前项目继续编辑和下载。' },
  { question: '哪些功能可以免费体验？', answer: '注册后可使用基础对话和体验额度；具体模型与生成成本会在提交任务前显示。' },
]

const catalog = useCatalogStore()
const fallbackLanding: LandingContent = {
  heroLead: '在一个平台，完成', modes: defaultModes, navGroups: defaultNavGroups, previewNav: defaultPreviewNav,
  trustTitle: '创作可以大胆，关键信息不能靠猜。', trustDescription: 'Xinyue AI 会利用当前对话和你提供的资料继续工作；涉及事实信息时，只使用有依据的内容。',
  trustItems: [{ title: '上下文持续可用，作品统一留存', description: '项目里的对话、文件和生成结果会统一保留，可从明确版本继续处理。' }, { title: '有依据的信息，才写进商业内容', description: '没有可靠依据的内容，不会被包装成商品事实。' }],
  linksTitle: '把当前任务，接到合适的下一步。', linksDescription: '根据现在要完成的内容，继续了解相关能力和使用方式。', capabilityLinks: defaultCapabilityLinks,
  faqTitle: '开始前，你可能还想确认这些。', faqs: defaultFaqs,
  finalTitle: '从今天要完成的事开始。', finalDescription: '提出一个问题、生成素材或发起办公任务，选择当前任务就可以开始。', footerDescription: '在同一个平台完成 AI 对话、视觉创作、办公任务和团队协作。', copyright: '© 2026 Xinyue AI. 保留所有权利。',
}
const landing = computed<LandingContent>(() => ({ ...fallbackLanding, ...(catalog.settings.siteContent.landing || {}) }))
const modes = computed(() => landing.value.modes.length >= 3 ? landing.value.modes : defaultModes)
const navGroups = computed(() => landing.value.navGroups.length ? landing.value.navGroups : defaultNavGroups)
const previewNav = computed(() => landing.value.previewNav.length ? landing.value.previewNav : defaultPreviewNav)
const capabilityLinks = computed(() => landing.value.capabilityLinks.length ? landing.value.capabilityLinks : defaultCapabilityLinks)
const faqs = computed(() => landing.value.faqs.length ? landing.value.faqs : defaultFaqs)

const journeyStyle = computed(() => {
  const eased = Math.min(1, Math.max(0, journeyProgress.value / 0.228))
  const smooth = eased * eased * (3 - 2 * eased)
  return {
    '--journey-effects-opacity': String(1 - smooth),
    '--journey-effects-y': `${Math.round(-156 * smooth)}px`,
  }
})

function toggleNavMenu(key: string) {
  openNavMenu.value = openNavMenu.value === key ? null : key
}

function previewMode(index: number) {
  if (!journeyExpanded.value) activeMode.value = index
}

function selectMode(index: number) {
  selectedMode.value = index
  activeMode.value = index
  if (window.innerWidth < 1280) activateWorkflow(index)
}

function activateWorkflow(index: number) {
  activeMode.value = index
  selectedMode.value = index
  const element = story.value
  const desktop = window.innerWidth >= 1280 && window.innerHeight >= 560
  if (!element || !desktop) return
  const top = window.scrollY + element.getBoundingClientRect().top
  const distance = Math.max(1, element.offsetHeight - window.innerHeight)
  const progress = 0.25 + ((index + 0.5) / modes.value.length) * 0.75
  window.scrollTo({ top: top + distance * progress, behavior: 'smooth' })
}

function updateScroll() {
  frame = 0
  headerScrolled.value = window.scrollY > 8
  const element = story.value
  const desktop = window.innerWidth >= 1280 && window.innerHeight >= 560
  if (!element || !desktop) {
    journeyExpanded.value = false
    journeyProgress.value = 0
    return
  }
  const rect = element.getBoundingClientRect()
  const distance = Math.max(1, element.offsetHeight - window.innerHeight)
  const progress = Math.min(1, Math.max(0, (64 - rect.top) / distance))
  journeyProgress.value = progress
  journeyExpanded.value = progress >= 0.25
  if (progress < 0.125) {
    activeMode.value = selectedMode.value
  } else if (progress >= 0.25) {
    const normalized = Math.min(0.999, Math.max(0, (progress - 0.25) / 0.75))
    activeMode.value = Math.min(modes.value.length - 1, Math.floor(normalized * modes.value.length))
  }
}

function scheduleScrollUpdate() {
  if (!frame) frame = window.requestAnimationFrame(updateScroll)
}

function closeNavOnOutside(event: PointerEvent) {
  if (!(event.target as Element | null)?.closest('.landing-nav-menu')) openNavMenu.value = null
}

function closeNavOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') openNavMenu.value = null
}

watch(mobileMenuOpen, (open) => {
  document.documentElement.classList.toggle('landing-menu-open', open)
})

onMounted(() => {
  void catalog.load()
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true })
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true })
  document.addEventListener('pointerdown', closeNavOnOutside)
  document.addEventListener('keydown', closeNavOnEscape)
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        revealObserver?.unobserve(entry.target)
      }
    })
  }, { threshold: 0.12, rootMargin: '0px 0px -10% 0px' })
  document.querySelectorAll('.landing-reveal').forEach((element) => revealObserver?.observe(element))
  updateScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', scheduleScrollUpdate)
  window.removeEventListener('resize', scheduleScrollUpdate)
  document.removeEventListener('pointerdown', closeNavOnOutside)
  document.removeEventListener('keydown', closeNavOnEscape)
  revealObserver?.disconnect()
  document.documentElement.classList.remove('landing-menu-open')
  if (frame) window.cancelAnimationFrame(frame)
})
</script>
