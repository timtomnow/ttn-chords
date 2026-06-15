// In-app Help loader. Guides are Markdown files in src/content/help/*.md, each
// with frontmatter (title/category/order/summary). They're inlined at build time
// via import.meta.glob (no runtime fetch). Shared by the Help pages; the model is
// Section (category) → Process (guide) → Step (## / ### heading). See the
// ttn-docs help-contract for the cross-app shape.

type Frontmatter = {
  title: string;
  category: string;
  order: number;
  summary: string;
};

export type Guide = Frontmatter & {
  /** Filename minus .md — the canonical slug used in /help/<slug> links. */
  slug: string;
  /** Markdown body (frontmatter stripped). */
  body: string;
};

export type Heading = { depth: 2 | 3; text: string; id: string };

export type Section = {
  /** The category name. */
  name: string;
  /** URL-safe id for /help/section/<slug>. */
  slug: string;
  guides: Guide[];
};

/** Shared slugifier — the loader (ToC ids) and renderer (heading ids) must agree. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const categorySlug = slugify;

// Eagerly inline every guide's raw text at build time.
const RAW = import.meta.glob('../content/help/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Minimal frontmatter parser (avoids a gray-matter dependency). */
function parse(raw: string): { fm: Partial<Frontmatter>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { fm: {}, body: raw };
  const fm: Record<string, string | number> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value: string | number = m[2].trim().replace(/^["']|["']$/g, '');
    if (key === 'order') value = Number(value) || 0;
    fm[key] = value;
  }
  return { fm: fm as Partial<Frontmatter>, body: match[2].trim() };
}

const GUIDES: Guide[] = Object.entries(RAW)
  .map(([path, raw]) => {
    const slug = path.split('/').pop()!.replace(/\.md$/, '');
    const { fm, body } = parse(raw);
    return {
      slug,
      title: fm.title ?? slug,
      category: fm.category ?? 'General',
      order: fm.order ?? 0,
      summary: fm.summary ?? '',
      body,
    };
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export function getGuides(): Guide[] {
  return GUIDES;
}

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** Sections in category order (first appearance by lowest guide order). */
export function getGuidesByCategory(): Section[] {
  const order: string[] = [];
  const map = new Map<string, Guide[]>();
  for (const g of GUIDES) {
    if (!map.has(g.category)) {
      map.set(g.category, []);
      order.push(g.category);
    }
    map.get(g.category)!.push(g);
  }
  return order.map((name) => ({ name, slug: categorySlug(name), guides: map.get(name)! }));
}

export function getSection(slug: string): Section | undefined {
  return getGuidesByCategory().find((s) => s.slug === slug);
}

/** Pull ## / ### headings out of a body for an "On this page" mini-ToC. */
export function extractHeadings(body: string): Heading[] {
  const out: Heading[] = [];
  // Skip fenced code blocks so a "## " inside a sample isn't treated as a heading.
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[2].trim();
    out.push({ depth: m[1].length as 2 | 3, text, id: slugify(text) });
  }
  return out;
}
