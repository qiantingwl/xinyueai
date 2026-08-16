import { ProxyAgent, fetch as httpFetch, type Dispatcher } from "undici";

export type RemoteVideoPrompt = {
  id: string;
  title: string;
  prompt: string;
  description: string;
  tags: string[];
  author: string;
  imageModel: string;
  coverUrl: string;
  previewVideoUrl: string;
  referenceImageUrls: string[];
  sourceUrl: string;
  syncedAt: string;
};

type ProgressCallback = (items: RemoteVideoPrompt[]) => Promise<void>;

const GENERATE_PROMPT_SERVER_FN =
  "https://generateprompt.net/_serverFn/64a07113b80d990dbd8eac2d40e7025edbdc19b04277a823aa93de3d04ac6b19";
const REQUEST_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36 XinyueAI/1.0",
};

let proxyDispatcher: Dispatcher | undefined;

function dispatcher() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;
  if (!proxyUrl) return undefined;
  proxyDispatcher ||= new ProxyAgent(proxyUrl);
  return proxyDispatcher;
}

async function requestText(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 25_000,
) {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await httpFetch(url, {
        dispatcher: dispatcher(),
        headers: { ...REQUEST_HEADERS, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (reason) {
      failure = reason;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw failure instanceof Error ? failure : new Error("远程提示词请求失败");
}

function urlsFromSitemap(xml: string) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter((url) => /^https?:\/\//i.test(url));
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function metaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return "";
}

function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function decodeNextFlight(html: string) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)<\/script>/g)]
    .map((match) => {
      try {
        return JSON.parse(match[1]) as string;
      } catch {
        return "";
      }
    })
    .join("");
}

async function concurrentHydrate(
  urls: string[],
  previous: readonly RemoteVideoPrompt[],
  task: (url: string, index: number) => Promise<RemoteVideoPrompt | null>,
  onProgress?: ProgressCallback,
) {
  const allowed = new Set(urls);
  const byUrl = new Map(
    previous
      .filter((item) => item.sourceUrl && allowed.has(item.sourceUrl))
      .map((item) => [item.sourceUrl, item]),
  );
  const pending = urls.filter((url) => !byUrl.has(url));
  let cursor = 0;
  let completed = 0;
  let lastPersisted = 0;
  let persisting = Promise.resolve();

  const snapshot = () =>
    urls.map((url) => byUrl.get(url)).filter((item): item is RemoteVideoPrompt => Boolean(item));
  const worker = async () => {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const url = pending[index];
      try {
        const item = await task(url, index);
        if (item) byUrl.set(url, item);
      } catch {
        // Failed pages remain pending and are retried during the next incremental refresh.
      }
      completed += 1;
      if (onProgress && completed - lastPersisted >= 20) {
        lastPersisted = completed;
        const items = snapshot();
        persisting = persisting.then(() => onProgress(items));
        await persisting;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(6, pending.length) }, () => worker()));
  const items = snapshot();
  if (onProgress && completed > lastPersisted) {
    persisting = persisting.then(() => onProgress(items));
  }
  await persisting;
  return items;
}

function flightField(segment: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeJsonString(
    segment.match(new RegExp(`"${escaped}":"((?:\\\\.|[^"\\\\])*)"`))?.[1] || "",
  );
}

function flightArrayFirst(segment: string, field: string) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeJsonString(
    segment.match(new RegExp(`"${escaped}":\\["((?:\\\\.|[^"\\\\])*)"`))?.[1] || "",
  );
}

function youMindPromptSegment(flight: string, id: string) {
  const marker = `"promptId":${id}`;
  const start = flight.indexOf(marker);
  if (start < 0) return "";
  const next = flight.indexOf('"promptId":', start + marker.length);
  return flight.slice(start, next > start ? next : start + 200_000);
}

function youMindDetail(html: string, sourceUrl: string): RemoteVideoPrompt | null {
  const id = sourceUrl.match(/(?:-|\/)(\d+)\/?$/)?.[1];
  if (!id) return null;
  const flight = decodeNextFlight(html);
  const promptMatch = flight.match(
    new RegExp(`"promptId":${id},"promptContent":"((?:\\\\.|[^"\\\\])*)"`),
  );
  const translatedMatch = flight.match(
    new RegExp(`"promptId":${id}[\\s\\S]{0,50000}?"translatedContent":"((?:\\\\.|[^"\\\\])*)"`),
  );
  const prompt = decodeJsonString(promptMatch?.[1] || translatedMatch?.[1] || "");
  const title =
    metaContent(html, "og:image:alt") ||
    decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").split(" - ")[0];
  if (!title || !prompt) return null;
  const description = metaContent(html, "description");
  const coverUrl = metaContent(html, "og:image");
  const contentUrl = flight.match(/"contentUrl":"(https?:[^"\\]+)"/)?.[1] || "";
  const model =
    metaContent(html, "keywords").split(",")[0]?.replace(/\s*视频提示词\s*$/, "") ||
    "通用视频模型";
  const tags = metaContent(html, "keywords")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  return {
    id: `video-youmind:${id}`,
    title,
    prompt,
    description,
    tags: [...new Set([model, ...tags, "YouMind"])],
    author: "YouMind",
    imageModel: model,
    coverUrl,
    previewVideoUrl: decodeHtml(contentUrl),
    referenceImageUrls: coverUrl ? [coverUrl] : [],
    sourceUrl,
    syncedAt: new Date().toISOString(),
  };
}

function youMindImageDetail(html: string, sourceUrl: string): RemoteVideoPrompt | null {
  const id = sourceUrl.match(/(?:-|\/)(\d+)\/?$/)?.[1];
  if (!id) return null;
  const flight = decodeNextFlight(html);
  const segment = youMindPromptSegment(flight, id);
  if (!segment || flightField(segment, "promptType") !== "image") return null;

  const prompt = flightField(segment, "promptContent") || flightField(segment, "translatedContent");
  const title =
    metaContent(html, "og:image:alt") ||
    decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").split(" - ")[0];
  const coverUrl =
    flightArrayFirst(segment, "referenceImages") ||
    flightArrayFirst(segment, "thumbnails") ||
    flightArrayFirst(segment, "images") ||
    metaContent(html, "og:image");
  if (!title || !prompt || !coverUrl) return null;

  const model = flightField(segment, "modelSlug") || "通用图片模型";
  const tags = metaContent(html, "keywords")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  return {
    id: `image-youmind:${id}`,
    title,
    prompt,
    description: metaContent(html, "description"),
    tags: [...new Set([model, ...tags])],
    author: "YouMind",
    imageModel: model,
    coverUrl: decodeHtml(coverUrl),
    previewVideoUrl: "",
    referenceImageUrls: [decodeHtml(coverUrl)],
    sourceUrl,
    syncedAt: new Date().toISOString(),
  };
}

async function youMindPromptUrls(kind: "image" | "video") {
  const index = await requestText("https://youmind.com/sitemap.xml");
  const sitemapUrls = urlsFromSitemap(index).filter((url) =>
    /\/sitemaps\/prompts\/sitemap\/\d+\.xml$/.test(url),
  );
  const maps = await Promise.all(sitemapUrls.map((url) => requestText(url, {}, 60_000)));
  const route = kind === "video" ? "/video-prompts/" : "/prompts/";
  const localeRank = (url: string) =>
    url.includes(`/zh-CN${route}`) ? 0 : url.includes(route) ? 1 : 2;
  const canonical = new Map<string, string>();
  for (const url of maps.flatMap(urlsFromSitemap)) {
    if (!url.includes(route) || (kind === "image" && url.includes("/video-prompts/"))) continue;
    const slug = url.split(route)[1]?.replace(/\/$/, "");
    if (!slug || !/-\d+$/.test(slug)) continue;
    const current = canonical.get(slug);
    if (!current || localeRank(url) < localeRank(current)) canonical.set(slug, url);
  }
  return [...canonical.values()];
}

export async function syncYouMindImages(
  previous: readonly RemoteVideoPrompt[],
  onProgress?: ProgressCallback,
) {
  const urls = await youMindPromptUrls("image");
  return concurrentHydrate(
    urls,
    previous,
    async (url) => youMindImageDetail(await requestText(url, {}, 60_000), url),
    onProgress,
  );
}

export async function syncYouMindVideos(
  previous: readonly RemoteVideoPrompt[],
  onProgress?: ProgressCallback,
) {
  const urls = await youMindPromptUrls("video");
  return concurrentHydrate(
    urls,
    previous,
    async (url) => youMindDetail(await requestText(url, {}, 60_000), url),
    onProgress,
  );
}

function higgsfieldGroup(url: string) {
  if (url.includes("/apps/")) return "Higgsfield Apps";
  if (url.includes("/mixed-media-presets/")) return "Mixed Media Presets";
  if (url.includes("/viral-presets/")) return "Viral Presets";
  return "Motion";
}

const HIGGSFIELD_APP_CATEGORY_PAGES = new Set([
  "ads-products",
  "camera-motion",
  "enhance-style",
  "extras",
  "face-identity",
  "games-characters",
  "trending-templates",
  "video-editing",
]);

function higgsfieldAppCategory(html: string, slug: string) {
  const pattern =
    /\{id:"[^"]+",name:"((?:\\.|[^"\\])*)",priority:\d+,description:"(?:\\.|[^"\\])*",slug:"(?:\\.|[^"\\])*",icon:"[^"]+",apps:\$R\[\d+\]=\[/g;
  const matches = [...html.matchAll(pattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index || 0;
    const end = matches[index + 1]?.index || html.length;
    const section = html.slice(start, end);
    if (new RegExp(`slug:"${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(section))
      return decodeJsonString(matches[index][1]);
  }
  return "Higgsfield Apps";
}

function higgsfieldAppMedia(html: string, slug: string) {
  const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const routeMarker = html.indexOf(`apps\\0${slug}`);
  const route = html.slice(routeMarker >= 0 ? routeMarker : 0, (routeMarker >= 0 ? routeMarker : 0) + 220_000);
  const preset = route.match(
    /appPreset:\$R\[\d+\]=\{id:"((?:\\.|[^"\\])*)",title:"((?:\\.|[^"\\])*)",name:"((?:\\.|[^"\\])*)",description:"((?:\\.|[^"\\])*)",shortDescription:"((?:\\.|[^"\\])*)",media:\$R\[\d+\]=\{type:"(video|static)",source:"((?:\\.|[^"\\])*)",width:\d+,height:\d+,thumbnail:(?:"((?:\\.|[^"\\])*)"|void 0)/,
  );
  if (preset) {
    return {
      title: decodeJsonString(preset[3]),
      description: decodeJsonString(preset[4] || preset[5]),
      previewVideoUrl: preset[6] === "video" ? decodeJsonString(preset[7]) : "",
      coverUrl: decodeJsonString(preset[8] || (preset[6] === "static" ? preset[7] : "")),
    };
  }

  const preview = html.match(
    new RegExp(
      `slug:"${escaped}",preview:\\$R\\[\\d+\\]=\\{type:"(video|static)",source:"((?:\\\\.|[^"\\\\])*)",width:\\d+,height:\\d+,thumbnail:(?:"((?:\\\\.|[^"\\\\])*)"|void 0)[\\s\\S]{0,500}?mediaDescription:"((?:\\\\.|[^"\\\\])*)"`,
    ),
  );
  return {
    title: "",
    description: decodeJsonString(preview?.[4] || ""),
    previewVideoUrl: preview?.[1] === "video" ? decodeJsonString(preview[2]) : "",
    coverUrl: decodeJsonString(preview?.[3] || (preview?.[1] === "static" ? preview[2] : "")),
  };
}

function higgsfieldAppDetail(html: string, sourceUrl: string): RemoteVideoPrompt | null {
  const slug = sourceUrl.split("/apps/")[1]?.replace(/\/$/, "");
  if (!slug || HIGGSFIELD_APP_CATEGORY_PAGES.has(slug)) return null;
  const media = higgsfieldAppMedia(html, slug);
  const rawTitle = decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] || "");
  const title = media.title || rawTitle.replace(/\s*[•|-]\s*Higgsfield.*$/i, "").trim();
  const description =
    media.description || metaContent(html, "description") || metaContent(html, "og:description");
  if (!title || !description) return null;
  const category = higgsfieldAppCategory(html, slug);
  const metaCover = metaContent(html, "og:image");
  const coverUrl = media.coverUrl || metaCover;
  return {
    id: `video-higgsfield-app:${slug}`,
    title,
    prompt: description,
    description,
    tags: [category, "Higgsfield Apps", "创意效果"],
    author: "Higgsfield",
    imageModel: "Higgsfield Apps",
    coverUrl,
    previewVideoUrl: media.previewVideoUrl,
    referenceImageUrls: coverUrl ? [coverUrl] : [],
    sourceUrl,
    syncedAt: new Date().toISOString(),
  };
}

function higgsfieldDetail(html: string, sourceUrl: string): RemoteVideoPrompt | null {
  if (sourceUrl.includes("/apps/")) return higgsfieldAppDetail(html, sourceUrl);
  const group = higgsfieldGroup(sourceUrl);
  const rawTitle = decodeHtml(html.match(/<title>([^<]+)<\/title>/i)?.[1] || "");
  const title = rawTitle.replace(/\s*[•|-]\s*Higgsfield.*$/i, "").trim();
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  if (!title || !description) return null;
  const animatedCover = html.match(/preview:\$R\[\d+\]=\{type:"animated",source:"([^"]+)"/)?.[1];
  const image =
    animatedCover ||
    metaContent(html, "og:image") ||
    html.match(/https?:[^"'\\]+\.(?:webp|jpe?g|png)(?:\?[^"'\\]*)?/i)?.[0] ||
    "";
  const video = html.match(/https?:[^"'\\]+\.mp4(?:\?[^"'\\]*)?/i)?.[0] || "";
  const slug = sourceUrl.split("higgsfield.ai/")[1]?.replace(/\/$/, "") || sourceUrl;
  return {
    id: `video-higgsfield:${slug.replace(/[^a-zA-Z0-9_-]+/g, ":")}`,
    title,
    prompt: description,
    description,
    tags: [group, "Higgsfield", group === "Motion" ? "电影运镜" : "视频特效"],
    author: "Higgsfield",
    imageModel: "Higgsfield Video",
    coverUrl: decodeHtml(image),
    previewVideoUrl: decodeHtml(video),
    referenceImageUrls: image ? [decodeHtml(image)] : [],
    sourceUrl,
    syncedAt: new Date().toISOString(),
  };
}

export async function syncHiggsfieldVideos(
  previous: readonly RemoteVideoPrompt[],
  onProgress?: ProgressCallback,
) {
  const sitemapUrls = [
    "https://higgsfield.ai/motion/sitemap.xml",
    "https://higgsfield.ai/mixed-media-presets/sitemap.xml",
    "https://higgsfield.ai/viral-presets/sitemap.xml",
    "https://higgsfield.ai/apps/sitemap.xml",
  ];
  const maps = await Promise.all(sitemapUrls.map((url) => requestText(url, {}, 60_000)));
  const urls = [...new Set(maps.flatMap(urlsFromSitemap))];
  return concurrentHydrate(
    urls,
    previous,
    async (url) => higgsfieldDetail(await requestText(url, {}, 45_000), url),
    onProgress,
  );
}

function generatePromptPayload(page: number, cursor: string) {
  const keys = ["type", "page", "limit", "category", "tag", "model", "cursor", "locale"];
  const values = [
    { t: 1, s: "video" },
    { t: 0, s: page },
    { t: 0, s: 12 },
    { t: 1, s: "" },
    { t: 1, s: "" },
    { t: 1, s: "" },
    { t: 1, s: cursor },
    { t: 1, s: "zh" },
  ];
  return JSON.stringify({
    t: {
      t: 10,
      i: 0,
      p: { k: ["data"], v: [{ t: 10, i: 1, p: { k: keys, v: values }, o: 0 }] },
      o: 0,
    },
    f: 63,
    m: [],
  });
}

function decodeTss(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const value = node as Record<string, unknown>;
  if (value.t === 0 || value.t === 1) return value.s;
  if (value.t === 2) return [null, undefined, true, false][Number(value.s)] ?? null;
  if (value.t === 9)
    return Array.isArray(value.a) ? value.a.map((item) => decodeTss(item)) : [];
  if ((value.t === 10 || value.t === 11) && value.p && typeof value.p === "object") {
    const pair = value.p as { k?: unknown[]; v?: unknown[] };
    const result: Record<string, unknown> = {};
    (pair.k || []).forEach((key, index) => {
      if (typeof key === "string") result[key] = decodeTss(pair.v?.[index]);
    });
    return result;
  }
  return undefined;
}

function generatePromptItem(row: Record<string, unknown>): RemoteVideoPrompt | null {
  const id = typeof row.id === "string" ? row.id : "";
  const slug = typeof row.slug === "string" ? row.slug : id;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const prompt = typeof row.prompt === "string" ? row.prompt.trim() : "";
  if (!id || !title || !prompt) return null;
  const description = typeof row.description === "string" ? row.description.trim() : "";
  const coverUrl = [row.thumbnailImage, row.previewImage, row.imageUrl, row.image]
    .find((value): value is string => typeof value === "string" && /^https?:\/\//.test(value)) || "";
  const videoUrl = typeof row.videoUrl === "string" ? row.videoUrl : "";
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const model = typeof row.model === "string" ? row.model : "通用视频模型";
  return {
    id: `video-generateprompt:${id}`,
    title,
    prompt,
    description,
    tags: [...new Set(["热门视频", model, ...tags])],
    author: typeof row.authorName === "string" ? row.authorName : "GeneratePrompt",
    imageModel: model,
    coverUrl,
    previewVideoUrl: videoUrl,
    referenceImageUrls: coverUrl ? [coverUrl] : [],
    sourceUrl: `https://generateprompt.net/zh/video-prompts/${slug}`,
    syncedAt: new Date().toISOString(),
  };
}

function parseGeneratePromptInitial(html: string) {
  const pattern = /id:"((?:\\.|[^"\\])*)",slug:"((?:\\.|[^"\\])*)",type:"video",model:"((?:\\.|[^"\\])*)",title:"((?:\\.|[^"\\])*)",description:"((?:\\.|[^"\\])*)",prompt:"((?:\\.|[^"\\])*)"/g;
  const matches = [...html.matchAll(pattern)];
  const field = (segment: string, name: string) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return decodeJsonString(
      segment.match(new RegExp(`${escaped}:"((?:\\\\.|[^"\\\\])*)"`))?.[1] || "",
    );
  };
  const items = matches
    .map((match, index) => {
      const start = match.index || 0;
      const segment = html.slice(start, matches[index + 1]?.index || start + 60_000);
      return (
      generatePromptItem({
        id: decodeJsonString(match[1]),
        slug: decodeJsonString(match[2]),
        model: decodeJsonString(match[3]),
        title: decodeJsonString(match[4]),
        description: decodeJsonString(match[5]),
        prompt: decodeJsonString(match[6]),
        image: field(segment, "image"),
        previewImage: field(segment, "previewImage"),
        imageUrl: field(segment, "imageUrl"),
        thumbnailImage: field(segment, "thumbnailImage"),
        videoUrl: field(segment, "videoUrl"),
        authorName: field(segment, "authorName"),
      })
      );
    })
    .filter((item): item is RemoteVideoPrompt => Boolean(item));
  return {
    items,
    nextCursor: decodeJsonString(html.match(/nextCursor:"((?:\\.|[^"\\])*)"/)?.[1] || ""),
    hasMore: /hasMore:!0/.test(html),
  };
}

export async function syncGeneratePromptVideos(initialHtml: string) {
  const initial = parseGeneratePromptInitial(initialHtml);
  const items = [...initial.items];
  let cursor = initial.nextCursor;
  let hasMore = initial.hasMore;
  for (let page = 2; hasMore && cursor && page <= 100; page += 1) {
    const url = `${GENERATE_PROMPT_SERVER_FN}?payload=${encodeURIComponent(generatePromptPayload(page, cursor))}`;
    const payload = JSON.parse(
      await requestText(url, {
        accept: "application/x-tss-framed, application/x-ndjson, application/json",
        referer: "https://generateprompt.net/zh/video-prompts",
        "x-tsr-serverfn": "true",
      }),
    ) as unknown;
    const decoded = decodeTss(payload) as {
      result?: { prompts?: Record<string, unknown>[]; nextCursor?: string; hasMore?: boolean };
    };
    const result = decoded?.result;
    if (!result || !Array.isArray(result.prompts)) break;
    items.push(
      ...result.prompts
        .map(generatePromptItem)
        .filter((item): item is RemoteVideoPrompt => Boolean(item)),
    );
    cursor = typeof result.nextCursor === "string" ? result.nextCursor : "";
    hasMore = result.hasMore === true;
  }
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
