import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaService } from "../prisma/prisma.service";
import { localPromptLibraryEntries } from "./prompt-library.defaults";
import {
  syncGeneratePromptVideos,
  syncHiggsfieldVideos,
  syncYouMindImages,
  syncYouMindVideos,
  type RemoteVideoPrompt,
} from "./remote-video-library";

export type PromptLibrarySource = {
  id: string;
  cacheRevision?: number;
  promptType: PromptLibraryType;
  upstreamName: string;
  defaultDisplayName: string;
  legacyDisplayNames?: string[];
  url?: string;
  fallbackUrl?: string;
  homepage: string;
  format:
    | "normalized"
    | "upma"
    | "local"
    | "shortfilm-builder"
    | "generateprompt-html"
    | "youmind-image-sitemap"
    | "youmind-sitemap"
    | "higgsfield-sitemaps";
  defaultSortOrder: number;
};

export type PromptLibraryType = "IMAGE" | "VIDEO";

export type PromptLibraryItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  promptType: PromptLibraryType;
  title: string;
  prompt: string;
  description: string;
  tags: string[];
  author: string;
  imageModel: string;
  coverUrl: string;
  previewVideoUrl: string;
  referenceImageUrls: string[];
  sourceUrl?: string;
  syncedAt?: string;
  enabled: boolean;
  overridden: boolean;
};

type SourceCache = {
  items: PromptLibraryItem[];
  fetchedAt: number;
  lastSuccessAt: string;
  lastError: string;
  complete?: boolean;
  revision?: number;
};
type SourceRuntime = PromptLibrarySource & {
  displayName: string;
  enabled: boolean;
  sortOrder: number;
};

const SOURCE_BASE =
  "https://cdn.jsdelivr.net/gh/yukkcat/image-prompts@main/dist/sources";
const SOURCE_FALLBACK_BASE =
  "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources";
const CACHE_TTL_MS = 60 * 60 * 1000;
const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;
const CACHE_DIRECTORY = join(process.cwd(), "storage", "prompt-library-cache");
const SOURCES: PromptLibrarySource[] = [
  {
    id: "upma-gpt-image-2",
    promptType: "IMAGE",
    upstreamName: "UPMA · GPT Image 2 提示词",
    defaultDisplayName: "商业视觉精选",
    legacyDisplayNames: ["GPT Image 2 精选一"],
    url: "https://cdn.jsdelivr.net/gh/freestylefly/awesome-gpt-image-2@main/data/cases.json",
    fallbackUrl:
      "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/cases.json",
    homepage: "https://www.upma.cn/image-prompts",
    format: "upma",
    defaultSortOrder: 10,
  },
  {
    id: "youmind-gpt-image-2",
    cacheRevision: 2,
    promptType: "IMAGE",
    upstreamName: "YouMind · Image Prompts",
    defaultDisplayName: "图片灵感精选",
    legacyDisplayNames: ["GPT Image 2 精选二", "YouMind 图片灵感"],
    homepage: "https://youmind.com/zh-CN/prompts/image",
    format: "youmind-image-sitemap",
    defaultSortOrder: 20,
  },
  {
    id: "youmind-nano-banana-pro",
    promptType: "IMAGE",
    upstreamName: "YouMind OpenLab · Nano Banana Pro",
    defaultDisplayName: "创意图片精选",
    legacyDisplayNames: ["Nano Banana Pro 精选"],
    url: `${SOURCE_BASE}/youmind-nano-banana-pro.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/youmind-nano-banana-pro.json`,
    homepage:
      "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
    format: "normalized",
    defaultSortOrder: 30,
  },
  {
    id: "banana-prompt-quicker",
    promptType: "IMAGE",
    upstreamName: "Banana Prompt Quicker",
    defaultDisplayName: "通用图片模板",
    legacyDisplayNames: ["通用图片提示词"],
    url: `${SOURCE_BASE}/banana-prompt-quicker.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/banana-prompt-quicker.json`,
    homepage: "https://glidea.github.io/banana-prompt-quicker/",
    format: "normalized",
    defaultSortOrder: 40,
  },
  {
    id: "davidwu-gpt-image2-prompts",
    promptType: "IMAGE",
    upstreamName: "DavidWu · GPT Image 2",
    defaultDisplayName: "图片创作案例",
    legacyDisplayNames: ["GPT Image 2 创意库"],
    url: `${SOURCE_BASE}/davidwu-gpt-image2-prompts.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/davidwu-gpt-image2-prompts.json`,
    homepage: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts",
    format: "normalized",
    defaultSortOrder: 50,
  },
  {
    id: "awesome-gpt-image",
    promptType: "IMAGE",
    upstreamName: "ZeroLu · Awesome GPT Image",
    defaultDisplayName: "视觉风格精选",
    legacyDisplayNames: ["GPT Image 精选"],
    url: `${SOURCE_BASE}/awesome-gpt-image.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/awesome-gpt-image.json`,
    homepage: "https://github.com/ZeroLu/awesome-gpt-image",
    format: "normalized",
    defaultSortOrder: 60,
  },
  {
    id: "awesome-gpt4o-image-prompts",
    promptType: "IMAGE",
    upstreamName: "ImgEdify · Awesome GPT-4o",
    defaultDisplayName: "图文设计精选",
    legacyDisplayNames: ["GPT-4o 图片提示词"],
    url: `${SOURCE_BASE}/awesome-gpt4o-image-prompts.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/awesome-gpt4o-image-prompts.json`,
    homepage: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts",
    format: "normalized",
    defaultSortOrder: 70,
  },
  {
    id: "video-generateprompt",
    cacheRevision: 2,
    promptType: "VIDEO",
    upstreamName: "GeneratePrompt · Video Prompts",
    defaultDisplayName: "热门视频精选",
    legacyDisplayNames: ["GeneratePrompt 视频灵感"],
    url: "https://generateprompt.net/zh/video-prompts",
    homepage: "https://generateprompt.net/zh/video-prompts",
    format: "generateprompt-html",
    defaultSortOrder: 120,
  },
  {
    id: "video-youmind",
    promptType: "VIDEO",
    upstreamName: "YouMind · Video Prompts",
    defaultDisplayName: "视频灵感精选",
    legacyDisplayNames: ["YouMind 视频灵感"],
    homepage: "https://youmind.com/zh-CN/prompts/video",
    format: "youmind-sitemap",
    defaultSortOrder: 110,
  },
];

const TAG_TRANSLATIONS: Record<string, string> = {
  "3d": "3D 设计",
  "ads & products": "广告与产品",
  brand: "品牌设计",
  "brand & logos": "品牌与标志",
  character: "角色设计",
  "characters & people": "人物与角色",
  "charts & infographics": "图表与信息图",
  cinematic: "电影感",
  commerce: "商业视觉",
  creative: "创意设计",
  education: "教育内容",
  "enhance & style": "增强与风格",
  extras: "更多效果",
  "face & identity": "人脸与身份",
  fashion: "时尚",
  food: "美食",
  history: "历史",
  "history & classical themes": "历史与古典",
  "higgsfield apps": "Higgsfield 应用",
  illustration: "插画",
  "illustration & art": "插画与艺术",
  infographic: "信息图",
  "games & characters": "游戏与角色",
  "mixed media presets": "混合媒体模板",
  motion: "电影运镜",
  "other use cases": "其他用途",
  photography: "摄影",
  "photography & realism": "摄影与写实",
  portrait: "人像",
  poster: "海报",
  "posters & typography": "海报与排版",
  product: "产品设计",
  professional: "专业创作",
  "products & e-commerce": "产品与电商",
  realistic: "写实",
  "scenes & storytelling": "场景与叙事",
  social: "社交媒体",
  story: "故事叙事",
  tech: "科技",
  "trending templates": "热门模板",
  travel: "旅行",
  ui: "界面设计",
  ui与界面: "界面设计",
  unknown: "其他",
  "video editing": "视频编辑",
  "viral presets": "爆款模板",
};

@Injectable()
export class PromptLibraryService implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<string, SourceCache>();
  private readonly loading = new Map<string, Promise<SourceCache>>();
  private refreshTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    setTimeout(() => {
      void this.configuredSources()
        .then((sources) => Promise.all(sources.map((source) => this.loadSource(source))))
        .catch(() => undefined);
    }, 1_000).unref();
    this.refreshTimer = setInterval(() => {
      void this.refreshAll().catch(() => undefined);
    }, AUTO_REFRESH_MS);
    this.refreshTimer.unref();
  }

  onModuleDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async list(input: {
    promptType?: string;
    query?: string;
    sourceId?: string;
    tag?: string;
    page?: number;
    pageSize?: number;
  }) {
    const promptType = this.parsePromptType(input.promptType);
    const sources = (await this.configuredSources()).filter(
      (source) => source.enabled && source.promptType === promptType,
    );
    const sourceId = input.sourceId?.trim() || "";
    const selectedSources = sourceId
      ? sources.filter((source) => source.id === sourceId)
      : sources;
    const allItems = await this.itemsForSources(selectedSources);
    const query = input.query?.trim().toLocaleLowerCase() || "";
    const tag = input.tag?.trim() || "";
    const queryMatches = allItems.filter(
      (item) =>
        item.enabled &&
        (!query ||
          [
            item.title,
            item.prompt,
            item.description,
            item.author,
            item.imageModel,
            ...item.tags,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)),
    );
    const filtered = queryMatches.filter(
      (item) => !tag || item.tags.includes(tag),
    );
    const pageSize = Math.max(1, Math.min(60, input.pageSize || 24));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, input.page || 1));
    return {
      items: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => this.publicItem(item)),
      total: filtered.length,
      page,
      pageSize,
      sources: await this.publicSources(sources),
      tags: this.collectTags(queryMatches),
      partial: selectedSources.some((source) =>
        Boolean(this.cache.get(source.id)?.lastError),
      ),
      promptType,
    };
  }

  async publicItemById(itemId: string) {
    const sources = (await this.configuredSources()).filter((source) => source.enabled);
    const item = (await this.itemsForSources(sources)).find(
      (candidate) => candidate.id === itemId && candidate.enabled,
    );
    if (!item) throw new NotFoundException("提示词不存在或已停用");
    return this.publicItem(item);
  }

  async adminSources() {
    const sources = await this.configuredSources();
    await Promise.all(sources.map((source) => this.loadSource(source)));
    const hiddenCounts = await this.prisma.promptLibraryItemOverride.groupBy({
      by: ["sourceId"],
      where: { enabled: false },
      _count: { itemId: true },
    });
    const hidden = new Map(
      hiddenCounts.map((row) => [row.sourceId, row._count.itemId]),
    );
    return sources.map((source) => {
      const cached = this.cache.get(source.id);
      return {
        id: source.id,
        promptType: source.promptType,
        promptTypeLabel: this.promptTypeLabel(source.promptType),
        displayName: source.displayName,
        upstreamName: source.upstreamName,
        homepage: source.homepage,
        enabled: source.enabled,
        sortOrder: source.sortOrder,
        count: Math.max(
          0,
          (cached?.items.length || 0) - (hidden.get(source.id) || 0),
        ),
        lastSuccessAt: cached?.lastSuccessAt || "",
        lastError: cached?.lastError || "",
        fetchedAt: cached?.fetchedAt ? new Date(cached.fetchedAt).toISOString() : "",
        complete: cached?.complete !== false,
        refreshing: this.loading.has(source.id),
        cacheRevision: source.cacheRevision || 1,
        autoRefreshHours: AUTO_REFRESH_MS / 60 / 60 / 1000,
      };
    });
  }

  async updateSource(
    id: string,
    input: { displayName?: string; enabled?: boolean; sortOrder?: number },
  ) {
    const source = SOURCES.find((item) => item.id === id);
    if (!source) throw new NotFoundException("提示词渠道不存在");
    const existing = await this.prisma.promptLibrarySourceConfig.findUnique({
      where: { id },
    });
    const row = await this.prisma.promptLibrarySourceConfig.upsert({
      where: { id },
      create: {
        id,
        displayName: input.displayName?.trim() || source.defaultDisplayName,
        enabled: input.enabled ?? true,
        sortOrder: input.sortOrder ?? source.defaultSortOrder,
      },
      update: {
        ...(input.displayName !== undefined
          ? {
              displayName:
                input.displayName.trim() || source.defaultDisplayName,
            }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
    });
    return {
      ...row,
      upstreamName: source.upstreamName,
      homepage: source.homepage,
      count: this.cache.get(id)?.items.length || 0,
      lastSuccessAt: this.cache.get(id)?.lastSuccessAt || "",
      lastError: this.cache.get(id)?.lastError || "",
      created: !existing,
    };
  }

  async adminItems(input: {
    promptType?: string;
    query?: string;
    sourceId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const requestedType = input.promptType
      ? this.parsePromptType(input.promptType)
      : null;
    const sources = (await this.configuredSources()).filter(
      (source) => !requestedType || source.promptType === requestedType,
    );
    const sourceId = input.sourceId?.trim() || "";
    const selectedSources = sourceId
      ? sources.filter((source) => source.id === sourceId)
      : sources;
    const items = await this.itemsForSources(selectedSources, true);
    const query = input.query?.trim().toLocaleLowerCase() || "";
    const filtered = items.filter(
      (item) =>
        !query ||
        [item.title, item.prompt, item.description, ...item.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
    );
    const pageSize = Math.max(1, Math.min(5000, input.pageSize || 20));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, input.page || 1));
    return {
      items: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => ({ ...item, promptTypeLabel: this.promptTypeLabel(item.promptType) })),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async updateItem(
    itemId: string,
    input: {
      title?: string;
      prompt?: string;
      description?: string;
      tags?: string[];
      coverUrl?: string;
      previewVideoUrl?: string;
      enabled?: boolean;
    },
  ) {
    const original = await this.getOriginalItem(itemId);
    return this.prisma.promptLibraryItemOverride.upsert({
      where: { itemId },
      create: {
        itemId,
        sourceId: original.sourceId,
        title: input.title?.trim() ?? original.title,
        prompt: input.prompt?.trim() ?? original.prompt,
        description: input.description?.trim() ?? original.description,
        tags: input.tags ?? original.tags,
        coverUrl: input.coverUrl?.trim() ?? null,
        previewVideoUrl: input.previewVideoUrl?.trim() ?? null,
        enabled: input.enabled ?? true,
      },
      update: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.coverUrl !== undefined
          ? { coverUrl: input.coverUrl.trim() }
          : {}),
        ...(input.previewVideoUrl !== undefined
          ? { previewVideoUrl: input.previewVideoUrl.trim() }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async resetItem(itemId: string) {
    await this.getOriginalItem(itemId);
    await this.prisma.promptLibraryItemOverride.deleteMany({
      where: { itemId },
    });
    return { reset: true };
  }

  async refreshAll() {
    this.cache.clear();
    const sources = await this.configuredSources();
    const results = await Promise.all(
      sources.map(async (source) => ({
        source,
        cache: await this.loadSource(source, true),
      })),
    );
    return {
      total: results.reduce(
        (sum, result) => sum + result.cache.items.length,
        0,
      ),
      sources: await this.adminSources(),
    };
  }

  async refreshSource(id: string) {
    const source = (await this.configuredSources()).find((item) => item.id === id);
    if (!source) throw new NotFoundException("提示词渠道不存在");
    const cache = await this.loadSource(source, true);
    return {
      id: source.id,
      count: cache.items.length,
      fetchedAt: new Date(cache.fetchedAt).toISOString(),
      lastSuccessAt: cache.lastSuccessAt,
      lastError: cache.lastError,
      complete: cache.complete !== false,
    };
  }

  private async configuredSources(): Promise<SourceRuntime[]> {
    const rows = await this.prisma.promptLibrarySourceConfig.findMany();
    const configs = new Map(rows.map((row) => [row.id, row]));
    return SOURCES.map((source) => {
      const config = configs.get(source.id);
      return {
        ...source,
        displayName:
          config?.displayName && !source.legacyDisplayNames?.includes(config.displayName)
            ? config.displayName
            : source.defaultDisplayName,
        enabled: config?.enabled ?? true,
        sortOrder: config?.sortOrder ?? source.defaultSortOrder,
      };
    }).sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.defaultSortOrder - right.defaultSortOrder,
    );
  }

  private async publicSources(sources: SourceRuntime[]) {
    const counts = await Promise.all(
      sources.map(
        async (source) =>
          (await this.itemsForSources([source])).filter((item) => item.enabled)
            .length,
      ),
    );
    return sources.map((source, index) => ({
      id: source.id,
      name: source.displayName,
      count: counts[index],
    }));
  }

  private async itemsForSources(
    sources: SourceRuntime[],
    includeDisabled = false,
  ) {
    const caches = await Promise.all(
      sources.map((source) => this.loadSource(source)),
    );
    const originals = caches.flatMap((cache) => cache.items);
    if (!originals.length) return [];
    const overrides = await this.prisma.promptLibraryItemOverride.findMany({
      where: { itemId: { in: originals.map((item) => item.id) } },
    });
    const overrideMap = new Map(overrides.map((row) => [row.itemId, row]));
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    return originals
      .map((item) => {
        const override = overrideMap.get(item.id);
        const source = sourceMap.get(item.sourceId);
        const sourceTags = override ? override.tags : item.tags;
        return {
          ...item,
          sourceName: source?.displayName || item.sourceName,
          title: override?.title ?? item.title,
          prompt: override?.prompt ?? item.prompt,
          description: override?.description ?? item.description,
          tags: this.localizeTags(
            item.sourceId === "video-generateprompt"
              ? [...this.inferVideoTags(item), ...sourceTags.filter((tag) => tag !== "热门视频")]
              : sourceTags,
          ),
          coverUrl: override?.coverUrl ?? item.coverUrl,
          previewVideoUrl: override?.previewVideoUrl ?? item.previewVideoUrl,
          enabled: override?.enabled ?? true,
          overridden: Boolean(override),
        };
      })
      .filter((item) => includeDisabled || item.enabled);
  }

  private publicItem(item: PromptLibraryItem) {
    return {
      id: item.id,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      promptType: item.promptType,
      title: item.title,
      prompt: item.prompt,
      description: item.description,
      tags: item.tags,
      author: item.author,
      imageModel: item.imageModel,
      coverUrl: item.coverUrl,
      previewVideoUrl: item.previewVideoUrl,
    };
  }

  private async loadSource(
    source: SourceRuntime,
    force = false,
  ): Promise<SourceCache> {
    const cached = this.cache.get(source.id);
    const crawler = this.isCrawlerSource(source);
    if (
      !force &&
      cached &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS &&
      (!crawler || cached.complete === true)
    )
      return cached;
    const pending = this.loading.get(source.id);
    if (pending) return !force && cached ? cached : pending;
    const persisted = cached || (await this.readPersistedCache(source));
    if (persisted) this.cache.set(source.id, persisted);
    if (
      !force &&
      persisted &&
      Date.now() - persisted.fetchedAt < CACHE_TTL_MS &&
      (!crawler || persisted.complete === true)
    )
      return persisted;

    if (!force && crawler) {
      const available = persisted || {
        items: this.localItems(source),
        fetchedAt: 0,
        lastSuccessAt: "",
        lastError: "正在同步完整来源",
        complete: false,
      };
      this.cache.set(source.id, available);
      const background = this.fetchSource(source, available).finally(() =>
        this.loading.delete(source.id),
      );
      this.loading.set(source.id, background);
      void background.catch(() => undefined);
      return available;
    }

    const loading = this.fetchSource(source, persisted).finally(() =>
      this.loading.delete(source.id),
    );
    this.loading.set(source.id, loading);
    return loading;
  }

  private async fetchSource(
    source: SourceRuntime,
    stale?: SourceCache,
  ): Promise<SourceCache> {
    try {
      if (source.format === "local") {
        const next = {
          items: this.localItems(source),
          fetchedAt: Date.now(),
          lastSuccessAt: new Date().toISOString(),
          lastError: "",
        };
        this.cache.set(source.id, next);
        await this.persistCache(source, next);
        return next;
      }
      if (
        source.format === "youmind-image-sitemap" ||
        source.format === "youmind-sitemap" ||
        source.format === "higgsfield-sitemaps"
      ) {
        const previous = this.remoteItems(stale?.items || []);
        const persistProgress = async (items: RemoteVideoPrompt[]) => {
          if (!items.length) return;
          const next = this.cacheResult(
            this.remoteSourceItems(source, items),
            false,
          );
          this.cache.set(source.id, next);
          await this.persistCache(source, next);
        };
        const items =
          source.format === "youmind-image-sitemap"
            ? await syncYouMindImages(previous, persistProgress)
            : source.format === "youmind-sitemap"
            ? await syncYouMindVideos(previous, persistProgress)
            : await syncHiggsfieldVideos(previous, persistProgress);
        const next = this.cacheResult(this.remoteSourceItems(source, items));
        this.cache.set(source.id, next);
        await this.persistCache(source, next);
        return next;
      }
      const payload = await this.fetchSourcePayload(source);
      if (source.format === "shortfilm-builder") {
        const next = this.cacheResult(this.parseShortfilmBuilder(source, payload));
        this.cache.set(source.id, next);
        await this.persistCache(source, next);
        return next;
      }
      if (source.format === "generateprompt-html") {
        if (typeof payload !== "string")
          throw new Error("GeneratePrompt 返回格式无效");
        const items = await syncGeneratePromptVideos(payload);
        const next = this.cacheResult(this.remoteSourceItems(source, items));
        this.cache.set(source.id, next);
        await this.persistCache(source, next);
        return next;
      }
      const values =
        source.format === "upma" &&
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload)
          ? (payload as Record<string, unknown>).cases
          : payload;
      if (!Array.isArray(values)) throw new Error("提示词源返回格式无效");
      const items = values
        .slice(0, 5000)
        .map((value) =>
          source.format === "upma"
            ? this.normalizeUpmaItem(source, value)
            : this.normalizeItem(source, value),
        )
        .filter((item): item is PromptLibraryItem => Boolean(item));
      const next = {
        items,
        fetchedAt: Date.now(),
        lastSuccessAt: new Date().toISOString(),
        lastError: "",
      };
      this.cache.set(source.id, next);
      await this.persistCache(source, next);
      return next;
    } catch (reason) {
      const fallbackItems = stale?.items.length
        ? stale.items
        : localPromptLibraryEntries
            .filter((item) => item.sourceId === source.id)
            .map((item, index): PromptLibraryItem => ({
              id: `${source.id}:local:${index + 1}`,
              sourceId: source.id,
              sourceName: source.displayName,
              promptType: source.promptType,
              title: item.title,
              prompt: item.prompt,
              description: item.description,
              tags: item.tags,
              author: item.author || "Xinyue AI",
              imageModel: item.modelName || (source.promptType === "VIDEO" ? "通用视频模型" : "通用图片模型"),
              coverUrl: item.coverUrl,
              previewVideoUrl: item.previewVideoUrl || "",
              referenceImageUrls: [item.coverUrl],
              enabled: true,
              overridden: false,
            }));
      const next = {
        items: fallbackItems,
        fetchedAt: Date.now(),
        lastSuccessAt: stale?.lastSuccessAt || "",
        lastError:
          reason instanceof Error ? reason.message : "提示词源加载失败",
        complete: !this.isCrawlerSource(source),
      };
      this.cache.set(source.id, next);
      return next;
    }
  }

  private async fetchSourcePayload(
    source: PromptLibrarySource,
  ): Promise<unknown> {
    let failure: unknown = new Error("提示词源加载失败");
    for (const url of [source.url, source.fallbackUrl].filter(
      (value): value is string => Boolean(value),
    )) {
      try {
        const expectsJson =
          source.format === "normalized" || source.format === "upma";
        const response = await fetch(url, {
          headers: {
            accept: expectsJson
              ? "application/json"
              : "text/html,application/javascript;q=0.9,*/*;q=0.8",
            "user-agent": "Xinyue-AI/1.0",
          },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return expectsJson
          ? await response.json()
          : await response.text();
      } catch (reason) {
        failure = reason;
      }
    }
    throw failure;
  }

  private normalizeItem(
    source: SourceRuntime,
    value: unknown,
  ): PromptLibraryItem | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const row = value as Record<string, unknown>;
    const id = this.text(row.id, 200);
    const title = this.text(row.title, 300);
    const prompt = this.text(row.prompt, 30_000);
    if (!id || !title || !prompt) return null;
    const referenceImageUrls = this.stringArray(row.referenceImageUrls, 12)
      .map((url) => this.httpUrl(url))
      .filter(Boolean);
    const coverUrl = this.httpUrl(row.coverUrl) || referenceImageUrls[0] || "";
    return {
      id,
      sourceId: source.id,
      sourceName: source.displayName,
      promptType: source.promptType,
      title,
      prompt,
      description: this.text(row.description, 2000),
      tags: this.stringArray(row.tags, 30).map((tag) => tag.slice(0, 80)),
      author: this.text(row.author, 200),
      imageModel: this.text(row.imageModel, 100),
      coverUrl,
      previewVideoUrl: this.httpUrl(row.previewVideoUrl),
      referenceImageUrls,
      enabled: true,
      overridden: false,
    };
  }

  private normalizeUpmaItem(
    source: SourceRuntime,
    value: unknown,
  ): PromptLibraryItem | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const row = value as Record<string, unknown>;
    const rawId =
      typeof row.id === "number" ? String(row.id) : this.text(row.id, 100);
    const title = this.text(row.title, 300);
    const prompt = this.text(row.prompt, 30_000);
    if (!rawId || !title || !prompt) return null;
    const tags = [
      this.text(row.category, 80),
      ...this.stringArray(row.styles, 12),
      ...this.stringArray(row.scenes, 12),
    ].filter(Boolean);
    const imagePath = this.text(row.image, 1000);
    const coverUrl = /^\/images\/[a-zA-Z0-9._-]+$/.test(imagePath)
      ? `https://cdn.jsdelivr.net/gh/freestylefly/awesome-gpt-image-2@main/data${imagePath}`
      : this.httpUrl(imagePath);
    return {
      id: `${source.id}:${rawId}`,
      sourceId: source.id,
      sourceName: source.displayName,
      promptType: source.promptType,
      title,
      prompt,
      description: this.text(row.promptPreview, 2000),
      tags: [...new Set(tags)],
      author: this.text(row.sourceLabel, 200),
      imageModel: "GPT Image 2",
      coverUrl,
      previewVideoUrl: "",
      referenceImageUrls: coverUrl ? [coverUrl] : [],
      enabled: true,
      overridden: false,
    };
  }

  private async getOriginalItem(itemId: string) {
    const sources = await this.configuredSources();
    const caches = await Promise.all(
      sources.map((source) => this.loadSource(source)),
    );
    const item = caches
      .flatMap((cache) => cache.items)
      .find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException("提示词不存在或来源暂时不可用");
    return item;
  }

  private collectTags(items: PromptLibraryItem[]) {
    const counts = new Map<string, number>();
    for (const tag of items.flatMap((item) => item.tags))
      counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts.entries()]
      .sort(
        (left, right) =>
          right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"),
      )
      .slice(0, 80)
      .map(([name, count]) => ({ name, count }));
  }

  private localItems(source: SourceRuntime): PromptLibraryItem[] {
    return localPromptLibraryEntries
      .filter((item) => item.sourceId === source.id)
      .map((item, index) => ({
        id: `${source.id}:local:${index + 1}`,
        sourceId: source.id,
        sourceName: source.displayName,
        promptType: source.promptType,
        title: item.title,
        prompt: item.prompt,
        description: item.description,
        tags: item.tags,
        author: item.author || "Xinyue AI",
        imageModel: item.modelName || (source.promptType === "VIDEO" ? "通用视频模型" : "通用图片模型"),
        coverUrl: item.coverUrl,
        previewVideoUrl: item.previewVideoUrl || "",
        referenceImageUrls: item.coverUrl ? [item.coverUrl] : [],
        enabled: true,
        overridden: false,
      }));
  }

  private isCrawlerSource(source: PromptLibrarySource) {
    return (
      source.format === "generateprompt-html" ||
      source.format === "youmind-image-sitemap" ||
      source.format === "youmind-sitemap" ||
      source.format === "higgsfield-sitemaps"
    );
  }

  private remoteItems(items: PromptLibraryItem[]): RemoteVideoPrompt[] {
    return items
      .filter(
        (item): item is PromptLibraryItem & { sourceUrl: string } =>
          Boolean(item.sourceUrl),
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        prompt: item.prompt,
        description: item.description,
        tags: item.tags,
        author: item.author,
        imageModel: item.imageModel,
        coverUrl: item.coverUrl,
        previewVideoUrl: item.previewVideoUrl,
        referenceImageUrls: item.referenceImageUrls,
        sourceUrl: item.sourceUrl,
        syncedAt: item.syncedAt || "",
      }));
  }

  private remoteSourceItems(
    source: SourceRuntime,
    items: RemoteVideoPrompt[],
  ): PromptLibraryItem[] {
    return items.map((item) => ({
      ...item,
      sourceId: source.id,
      sourceName: source.displayName,
      promptType: source.promptType,
      enabled: true,
      overridden: false,
    }));
  }

  private cacheResult(
    items: PromptLibraryItem[],
    complete = true,
  ): SourceCache {
    if (!items.length) throw new Error("提示词源没有返回可用内容");
    return {
      items,
      fetchedAt: Date.now(),
      lastSuccessAt: new Date().toISOString(),
      lastError: complete ? "" : "正在同步完整来源",
      complete,
    };
  }

  private parseShortfilmBuilder(source: SourceRuntime, payload: unknown): PromptLibraryItem[] {
    if (typeof payload !== "string") throw new Error("短片模板源返回格式无效");
    const match = payload.match(/window\.BUILDER_DATA\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!match) throw new Error("短片模板数据无法解析");
    const data = JSON.parse(match[1]) as { zh?: Array<Record<string, unknown>> };
    if (!Array.isArray(data.zh)) throw new Error("短片模板缺少中文目录");
    return data.zh.slice(0, 500).map((row, index) => {
      const id = this.text(row.id, 180) || `template-${index + 1}`;
      const prompt = this.text(row.prompt, 30000);
      const negative = this.text(row.negative, 10000);
      const media = this.localVideoMedia(index);
      return {
        id: `${source.id}:${id}`,
        sourceId: source.id,
        sourceName: source.displayName,
        promptType: "VIDEO" as const,
        title: this.text(row.title, 300) || this.text(row.label, 120) || id,
        prompt: negative ? `${prompt}\n\n反向提示词：${negative}` : prompt,
        description: this.text(row.label, 200) || "完整中文 AI 短片模板",
        tags: [this.text(row.label, 80), "完整模板", Array.isArray(row.vars) && row.vars.length ? "可填写变量" : "直接使用"].filter(Boolean),
        author: "jnMetaCode",
        imageModel: "Seedance / Kling / Veo / Sora",
        coverUrl: media.coverUrl,
        previewVideoUrl: media.previewVideoUrl,
        referenceImageUrls: [media.coverUrl],
        enabled: true,
        overridden: false,
      };
    }).filter((item) => Boolean(item.prompt));
  }

  private localVideoMedia(index: number) {
    const names = ["fashion-stage", "sci-fi-iris", "urban-transit", "artisan-pottery", "culinary-detail", "epic-coast", "liminal-corridor", "mountain-road", "urban-geometry"];
    const name = names[index % names.length];
    return {
      coverUrl: `/assets/inspirations/video/${name}.jpg`,
      previewVideoUrl: `/assets/inspirations/video/${name}.mp4`,
    };
  }

  private async readPersistedCache(source: SourceRuntime): Promise<SourceCache | undefined> {
    try {
      const raw = await readFile(join(CACHE_DIRECTORY, `${source.id}.json`), "utf8");
      const cache = JSON.parse(raw) as SourceCache;
      if (!Array.isArray(cache.items) || !Number.isFinite(cache.fetchedAt)) return undefined;
      const items = cache.items.filter((item) => item.sourceId === source.id);
      if (source.cacheRevision && cache.revision !== source.cacheRevision)
        return { ...cache, items, fetchedAt: 0, complete: false };
      return { ...cache, items };
    } catch { return undefined; }
  }

  private async persistCache(source: SourceRuntime, cache: SourceCache) {
    try {
      await mkdir(CACHE_DIRECTORY, { recursive: true });
      await writeFile(
        join(CACHE_DIRECTORY, `${source.id}.json`),
        JSON.stringify({ ...cache, revision: source.cacheRevision }),
        "utf8",
      );
    } catch { /* The in-memory cache remains available on read-only deployments. */ }
  }

  private parsePromptType(value?: string): PromptLibraryType {
    const normalized = value?.trim().toUpperCase();
    return normalized === "VIDEO" ? "VIDEO" : "IMAGE";
  }

  private promptTypeLabel(type: PromptLibraryType) {
    return type === "VIDEO" ? "视频" : "图片";
  }

  private text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }
  private localizeTags(tags: string[]) {
    const localized = tags
      .map((value) => {
        const tag = value.trim().slice(0, 80);
        const translated = TAG_TRANSLATIONS[tag.toLocaleLowerCase()];
        if (translated) return translated;
        if (/[\u3400-\u9fff]/.test(tag)) return tag;
        return "";
      })
      .filter(Boolean);
    return [...new Set(localized)].slice(0, 20);
  }
  private inferVideoTags(item: PromptLibraryItem) {
    const content = [item.title, item.prompt, item.description, ...item.tags]
      .join(" ")
      .toLocaleLowerCase();
    const rules: Array<[string, RegExp]> = [
      ["电影与叙事", /电影|剧情|故事|叙事|cinematic|\bfilm\b|story/],
      ["动漫与游戏", /动漫|动画|卡通|游戏|anime|animation|cartoon|\bgame/],
      ["人物与人像", /人物|人像|肖像|女孩|女性|男人|男孩|老人|舞者|woman|\bman\b|girl|boy|portrait|character/],
      ["产品与广告", /产品|广告|商品|品牌|包装|腕表|汽车|香水|product|commercial|advertis|package/],
      ["时尚与美妆", /时尚|服装|模特|美妆|珠宝|礼服|fashion|beauty|makeup|jewelry/],
      ["城市与建筑", /城市|街道|建筑|室内|房间|地铁|车站|urban|city|street|architecture|interior/],
      ["自然与风景", /森林|海岸|山谷|雪山|沙漠|河流|湖面|自然|风景|forest|mountain|ocean|coast|landscape|nature/],
      ["科幻与奇幻", /科幻|未来|太空|奇幻|魔法|机器人|赛博|cyber|sci[ -]?fi|fantasy|space|robot|futur/],
      ["动作与运动", /动作|武术|战斗|追逐|奔跑|运动|足球|篮球|action|fight|sport|running|chase/],
      ["镜头与转场", /镜头|运镜|推拉|跟拍|转场|俯拍|特写|camera|shot|zoom|tracking|transition|close-up/],
      ["美食与饮品", /美食|食物|料理|咖啡|茶饮|蛋糕|烹饪|food|coffee|cooking|drink/],
      ["动物与生物", /动物|猫咪|小狗|鸟群|鲸鱼|巨龙|animal|\bcat\b|\bdog\b|bird|whale|dragon/],
      ["舞蹈与音乐", /舞蹈|舞台|音乐|演唱|dance|music|concert|stage/],
      ["生活与纪实", /生活|日常|家庭|旅行|纪实|vlog|documentary|lifestyle|travel/],
      ["悬疑与惊悚", /悬疑|惊悚|恐怖|诡异|神秘|thriller|horror|mystery/],
    ];
    const inferred = rules
      .filter(([, pattern]) => pattern.test(content))
      .map(([label]) => label)
      .slice(0, 4);
    return inferred.length ? inferred : ["创意视频"];
  }
  private httpUrl(value: unknown) {
    const text = this.text(value, 2000);
    return /^https?:\/\//i.test(text) ? text : "";
  }
  private stringArray(value: unknown, maxItems: number) {
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is string =>
              typeof item === "string" && Boolean(item.trim()),
          )
          .slice(0, maxItems)
      : [];
  }
}
