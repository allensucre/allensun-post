import fs from "node:fs/promises";
import path from "node:path";

const BLOG_ROOT = path.resolve(process.cwd(), "src/data/blog");
const CONFIG_PATH = path.resolve(process.cwd(), "src/config.ts");
const CONSTANTS_PATH = path.resolve(process.cwd(), "src/constants.ts");
const INDEX_PATH = path.resolve(process.cwd(), "src/pages/index.astro");
const ABOUT_PATH = path.resolve(process.cwd(), "src/pages/about.md");

type FrontmatterValue = string | boolean | string[];

type PostSummary = {
  id: string;
  filePath: string;
  title: string;
  description: string;
  pubDatetime: string;
  draft: boolean;
  tags: string[];
  slug: string;
  folder: string;
  updatedAt: string;
};

type PostDetail = PostSummary & {
  body: string;
};

type SiteSettings = {
  site: Record<string, string>;
  home: {
    heading: string;
    intro: string;
    secondary: string;
    socialLabel: string;
  };
  socials: Array<{
    name: string;
    href: string;
    linkTitle: string;
  }>;
  about: {
    title: string;
    body: string;
  };
};

const json = (res: any, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
};

const readRequestBody = async (req: any) =>
  new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const encodeId = (relativePath: string) =>
  Buffer.from(relativePath, "utf8").toString("base64url");

const decodeId = (id: string) =>
  Buffer.from(id, "base64url").toString("utf8");

const assertSafePostPath = (relativePath: string) => {
  const normalized = path.normalize(relativePath);
  const absolutePath = path.resolve(BLOG_ROOT, normalized);

  if (
    normalized.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !absolutePath.startsWith(BLOG_ROOT + path.sep) ||
    !absolutePath.endsWith(".md")
  ) {
    throw new Error("Invalid post path");
  }

  return { normalized, absolutePath };
};

const slugify = (input: string) => {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `post-${Date.now()}`;
};

const parseScalar = (value: string): FrontmatterValue => {
  const trimmed = value.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
};

const parseFrontmatter = (content: string) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter: Record<string, FrontmatterValue> = {};
  const body = match ? content.slice(match[0].length) : content;

  if (!match) return { frontmatter, body };

  const lines = match[1].split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const scalar = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);

    if (!scalar) continue;

    const [, key, rawValue] = scalar;

    if (rawValue.trim() === "") {
      const values: string[] = [];

      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        values.push(String(parseScalar(lines[index].replace(/^\s+-\s+/, ""))));
      }

      frontmatter[key] = values;
    } else {
      frontmatter[key] = parseScalar(rawValue);
    }
  }

  return { frontmatter, body };
};

const yamlString = (value: string) => JSON.stringify(value ?? "");

const formatMarkdown = ({
  title,
  description,
  pubDatetime,
  draft,
  tags,
  body,
}: {
  title: string;
  description: string;
  pubDatetime: string;
  draft: boolean;
  tags: string[];
  body: string;
}) => {
  const safeTags = tags.map(tag => tag.trim()).filter(Boolean);

  return [
    "---",
    `title: ${yamlString(title)}`,
    'author: "Allen Sucre"',
    `pubDatetime: ${pubDatetime}`,
    `draft: ${draft ? "true" : "false"}`,
    "featured: false",
    "tags:",
    ...(safeTags.length ? safeTags : ["旧博客"]).map(tag => `  - ${yamlString(tag)}`),
    `description: ${yamlString(description)}`,
    "---",
    "",
    body.trim(),
    "",
  ].join("\n");
};

const walkMarkdownFiles = async (directory: string): Promise<string[]> => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) return walkMarkdownFiles(entryPath);
      if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("_")) {
        return [entryPath];
      }

      return [];
    })
  );

  return files.flat();
};

const summarizePost = async (absolutePath: string): Promise<PostDetail> => {
  const [content, stat] = await Promise.all([
    fs.readFile(absolutePath, "utf8"),
    fs.stat(absolutePath),
  ]);
  const { frontmatter, body } = parseFrontmatter(content);
  const relativePath = path.relative(BLOG_ROOT, absolutePath);
  const title = String(frontmatter.title || path.basename(relativePath, ".md"));
  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags.map(String)
    : [];

  return {
    id: encodeId(relativePath),
    filePath: relativePath,
    title,
    description: String(frontmatter.description || ""),
    pubDatetime: String(frontmatter.pubDatetime || ""),
    draft: frontmatter.draft === true,
    tags,
    slug: relativePath
      .replace(/\.md$/, "")
      .split(path.sep)
      .filter(segment => !segment.startsWith("_"))
      .join("/"),
    folder: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
    updatedAt: stat.mtime.toISOString(),
    body,
  };
};

const listPosts = async () => {
  const files = await walkMarkdownFiles(BLOG_ROOT);
  const posts = await Promise.all(files.map(summarizePost));

  return posts
    .map(({ body: _body, ...summary }) => summary)
    .sort((a, b) => b.pubDatetime.localeCompare(a.pubDatetime));
};

const createPost = async (payload: any) => {
  const title = String(payload.title || "").trim();
  const description = String(payload.description || "").trim();
  const pubDatetime =
    String(payload.pubDatetime || "").trim() || new Date().toISOString();
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map(String)
    : String(payload.tags || "")
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);
  const draft = payload.draft !== false;
  const folder = String(payload.folder || "drafts")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.\./g, "");
  const basename = `${pubDatetime.slice(0, 10)}-${slugify(title || "untitled")}.md`;
  const relativePath = path.join(folder || "drafts", basename);
  const { absolutePath, normalized } = assertSafePostPath(relativePath);
  const body = String(payload.body || `# ${title}\n\n`);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(
    absolutePath,
    formatMarkdown({ title, description, pubDatetime, draft, tags, body }),
    "utf8"
  );

  return summarizePost(absolutePath).then(post => ({
    ...post,
    filePath: normalized,
  }));
};

const updatePost = async (id: string, payload: any) => {
  const { absolutePath } = assertSafePostPath(decodeId(id));
  const existing = await summarizePost(absolutePath);
  const title = String(payload.title ?? existing.title).trim();
  const description = String(payload.description ?? existing.description).trim();
  const pubDatetime = String(payload.pubDatetime ?? existing.pubDatetime).trim();
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map(String)
    : existing.tags;
  const draft = Boolean(payload.draft);
  const body = String(payload.body ?? existing.body);

  await fs.writeFile(
    absolutePath,
    formatMarkdown({ title, description, pubDatetime, draft, tags, body }),
    "utf8"
  );

  return summarizePost(absolutePath);
};

const extractString = (source: string, key: string) => {
  const match = source.match(new RegExp(`${key}:\\s*"([^"]*)"`, "m"));
  return match?.[1] ?? "";
};

const replaceString = (source: string, key: string, value: string) =>
  source.replace(
    new RegExp(`(${key}:\\s*)"[^"]*"`, "m"),
    `$1${JSON.stringify(value)}`
  );

const extractBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return "";
  const contentStart = startIndex + start.length;
  const endIndex = source.indexOf(end, contentStart);
  if (endIndex === -1) return "";
  return source.slice(contentStart, endIndex).trim();
};

const replaceBetween = (
  source: string,
  start: string,
  end: string,
  value: string
) => {
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return source;
  const contentStart = startIndex + start.length;
  const endIndex = source.indexOf(end, contentStart);
  if (endIndex === -1) return source;
  return `${source.slice(0, contentStart)}\n        ${value.trim()}\n      ${source.slice(endIndex)}`;
};

const readSettings = async (): Promise<SiteSettings> => {
  const [config, constants, index, about] = await Promise.all([
    fs.readFile(CONFIG_PATH, "utf8"),
    fs.readFile(CONSTANTS_PATH, "utf8"),
    fs.readFile(INDEX_PATH, "utf8"),
    fs.readFile(ABOUT_PATH, "utf8"),
  ]);
  const aboutParsed = parseFrontmatter(about);
  const heading = extractBetween(index, '<h1 class="my-4 inline-block text-4xl font-bold sm:my-8 sm:text-5xl">', "</h1>");
  const intro = extractBetween(index, "<!-- ADMIN:home-intro:start -->", "<!-- ADMIN:home-intro:end -->") ||
    extractBetween(index, "<p>", "</p>");
  const secondary = extractBetween(index, "<!-- ADMIN:home-secondary:start -->", "<!-- ADMIN:home-secondary:end -->");
  const socialLabelMatch = index.match(/<div class="me-2 mb-1 whitespace-nowrap sm:mb-0">([^<]*)<\/div>/);
  const socials = [...constants.matchAll(/\{\s*name:\s*"([^"]*)",\s*href:\s*"([^"]*)",\s*linkTitle:\s*`([^`]*)`,\s*icon:\s*Icon(\w+),\s*\}/g)]
    .slice(0, 4)
    .map(match => ({
      name: match[1],
      href: match[2],
      linkTitle: match[3].replace(/\$\{SITE\.title\}/g, "{SITE.title}"),
    }));

  return {
    site: {
      website: extractString(config, "website"),
      author: extractString(config, "author"),
      profile: extractString(config, "profile"),
      desc: extractString(config, "desc"),
      title: extractString(config, "title"),
    },
    home: {
      heading,
      intro,
      secondary,
      socialLabel: socialLabelMatch?.[1] ?? "Social Links:",
    },
    socials,
    about: {
      title: String(aboutParsed.frontmatter.title || "About"),
      body: aboutParsed.body.trim(),
    },
  };
};

const normalizeSocialIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("github")) return "IconGitHub";
  if (lower === "x" || lower.includes("twitter")) return "IconBrandX";
  if (lower.includes("linkedin")) return "IconLinkedin";
  if (lower.includes("mail") || lower.includes("email")) return "IconMail";
  return "IconGitHub";
};

const formatTemplateString = (value: string) => {
  const marker = "__ADMIN_SITE_TITLE__";
  const escaped = value
    .replace(/\{SITE\.title\}/g, marker)
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(new RegExp(marker, "g"), "${SITE.title}");

  return `\`${escaped}\``;
};

const formatSocials = (socials: SiteSettings["socials"]) =>
  socials
    .filter(social => social.name.trim() && social.href.trim())
    .map(social => {
      const name = social.name.trim();
      const linkTitle = social.linkTitle.trim() || `${name} link`;

      return `  {
    name: ${JSON.stringify(social.name.trim())},
    href: ${JSON.stringify(social.href.trim())},
    linkTitle: ${formatTemplateString(linkTitle)},
    icon: ${normalizeSocialIcon(social.name)},
  },`;
    })
    .join("\n");

const updateSettings = async (payload: any) => {
  const current = await readSettings();
  const next: SiteSettings = {
    site: { ...current.site, ...(payload.site || {}) },
    home: { ...current.home, ...(payload.home || {}) },
    socials: Array.isArray(payload.socials) ? payload.socials : current.socials,
    about: { ...current.about, ...(payload.about || {}) },
  };

  let config = await fs.readFile(CONFIG_PATH, "utf8");
  for (const key of ["website", "author", "profile", "desc", "title"]) {
    config = replaceString(config, key, String(next.site[key] || ""));
  }
  await fs.writeFile(CONFIG_PATH, config, "utf8");

  let index = await fs.readFile(INDEX_PATH, "utf8");
  index = index.replace(
    /(<h1 class="my-4 inline-block text-4xl font-bold sm:my-8 sm:text-5xl">)[\s\S]*?(<\/h1>)/,
    `$1\n        ${next.home.heading.trim()}\n      $2`
  );
  index = replaceBetween(
    index,
    "<!-- ADMIN:home-intro:start -->",
    "<!-- ADMIN:home-intro:end -->",
    next.home.intro
  );
  index = replaceBetween(
    index,
    "<!-- ADMIN:home-secondary:start -->",
    "<!-- ADMIN:home-secondary:end -->",
    next.home.secondary
  );
  index = index.replace(
    /(<div class="me-2 mb-1 whitespace-nowrap sm:mb-0">)[^<]*(<\/div>)/,
    `$1${next.home.socialLabel.trim()}$2`
  );
  await fs.writeFile(INDEX_PATH, index, "utf8");

  let constants = await fs.readFile(CONSTANTS_PATH, "utf8");
  constants = constants.replace(
    /export const SOCIALS: Social\[\] = \[[\s\S]*?\] as const;/,
    `export const SOCIALS: Social[] = [\n${formatSocials(next.socials)}\n] as const;`
  );
  await fs.writeFile(CONSTANTS_PATH, constants, "utf8");

  await fs.writeFile(
    ABOUT_PATH,
    [
      "---",
      "layout: ../layouts/AboutLayout.astro",
      `title: ${JSON.stringify(next.about.title.trim() || "About")}`,
      "---",
      "",
      next.about.body.trim(),
      "",
    ].join("\n"),
    "utf8"
  );

  return readSettings();
};

export const adminDevServer = () => ({
  name: "local-writing-admin",
  apply: "serve",
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: any) => {
      if (!req.url?.startsWith("/api/admin")) {
        next();
        return;
      }

      try {
        const url = new URL(req.url, "http://localhost");

        if (req.method === "GET" && url.pathname === "/api/admin/posts") {
          json(res, 200, { posts: await listPosts() });
          return;
        }

        if (req.method === "GET" && url.pathname === "/api/admin/settings") {
          json(res, 200, { settings: await readSettings() });
          return;
        }

        if (req.method === "PUT" && url.pathname === "/api/admin/settings") {
          const payload = JSON.parse(await readRequestBody(req) || "{}");
          json(res, 200, { settings: await updateSettings(payload) });
          return;
        }

        const postMatch = url.pathname.match(/^\/api\/admin\/posts\/([^/]+)$/);

        if (req.method === "GET" && postMatch) {
          const { absolutePath } = assertSafePostPath(decodeId(postMatch[1]));
          json(res, 200, { post: await summarizePost(absolutePath) });
          return;
        }

        if (req.method === "POST" && url.pathname === "/api/admin/posts") {
          const payload = JSON.parse(await readRequestBody(req) || "{}");
          json(res, 201, { post: await createPost(payload) });
          return;
        }

        if (req.method === "PUT" && postMatch) {
          const payload = JSON.parse(await readRequestBody(req) || "{}");
          json(res, 200, { post: await updatePost(postMatch[1], payload) });
          return;
        }

        json(res, 404, { error: "Not found" });
      } catch (error) {
        json(res, 500, {
          error: error instanceof Error ? error.message : "Unknown admin error",
        });
      }
    });
  },
});
