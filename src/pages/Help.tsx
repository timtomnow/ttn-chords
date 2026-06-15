// In-app Help. Four views over the same Markdown guides (see src/lib/help.ts):
//   Index   (/help)                  — sections → their guides + a "full docs" link
//   Full    (/help/all)              — every guide on one page, nested contents up top
//   Section (/help/section/:section) — one section's guides on one page
//   Guide   (/help/:slug)            — a single guide with an "On this page" ToC
// "Deeper" views are one scrollable page with in-page anchors. Heading ids are
// slug(text), prefixed with `<guide>--` on any page that shows more than one
// guide, so deep links never collide.

import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  extractHeadings,
  getGuide,
  getGuides,
  getGuidesByCategory,
  getSection,
  slugify,
  type Guide,
} from '@/lib/help';

// ───────── helpers ─────────

function toText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(toText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return toText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

/** Scroll to the #hash element once content has rendered (deep links). */
function useScrollToHash(dep: unknown) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
  }, [hash, dep]);
}

/** Markdown renderer: headings get anchor ids; internal /help links use the SPA router. */
function Markdown({ body, idPrefix = '' }: { body: string; idPrefix?: string }) {
  const components: Components = {
    h2: ({ children }) => (
      <h2 id={idPrefix + slugify(toText(children))} className="scroll-mt-24">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 id={idPrefix + slugify(toText(children))} className="scroll-mt-24">
        {children}
      </h3>
    ),
    a: ({ href, children }) =>
      href && href.startsWith('/') ? (
        <Link to={href}>{children}</Link>
      ) : (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      ),
  };
  return (
    <div className="prose prose-ink max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-accent">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

/** A nested section → process → step contents list, linking to in-page anchors. */
function Contents({ guides, prefixIds }: { guides: Guide[]; prefixIds: boolean }) {
  return (
    <ul className="space-y-1 text-sm">
      {guides.map((g) => {
        const base = prefixIds ? `${g.slug}--` : '';
        return (
          <li key={g.slug}>
            <a href={`#${prefixIds ? g.slug : ''}`} className="font-medium text-accent">
              {g.title}
            </a>
            <ul className="ml-4 mt-1 space-y-0.5 text-ink-500 dark:text-ink-400">
              {extractHeadings(g.body).map((h) => (
                <li key={h.id} className={h.depth === 3 ? 'ml-3' : ''}>
                  <a href={`#${base}${h.id}`} className="hover:text-accent">
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

// ───────── Index ─────────

export function HelpIndex() {
  const sections = getGuidesByCategory();
  useScrollToHash('index');

  return (
    <div>
      <PageHeader
        title="Help & Guides"
        subtitle="How to use TTN Chords"
        actions={
          <Link className="btn-secondary" to="/help/all">
            <BookOpen size={16} /> View full help docs
          </Link>
        }
      />
      {sections.length === 0 ? (
        <EmptyState icon={BookOpen} title="No guides yet" description="Guides will appear here." />
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.slug} className="space-y-2">
              <Link to={`/help/section/${s.slug}`} className="label hover:text-accent">
                {s.name}
              </Link>
              <ul className="card divide-y divide-ink-200 dark:divide-ink-800">
                {s.guides.map((g) => (
                  <li key={g.slug}>
                    <Link
                      to={`/help/${g.slug}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/50"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{g.title}</span>
                        {g.summary && (
                          <span className="block truncate text-sm text-ink-500 dark:text-ink-400">
                            {g.summary}
                          </span>
                        )}
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-ink-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────── Full docs ─────────

export function HelpAll() {
  const sections = getGuidesByCategory();
  const guides = getGuides();
  useScrollToHash('all');

  return (
    <div>
      <Breadcrumb trail={[{ label: 'Help', to: '/help' }]} current="Full docs" />
      <PageHeader title="Full help docs" subtitle="Everything on one page" />

      <nav className="card mb-8 space-y-4 p-4">
        {sections.map((s) => (
          <div key={s.slug}>
            <div className="label mb-1">{s.name}</div>
            <Contents guides={s.guides} prefixIds />
          </div>
        ))}
      </nav>

      <div className="space-y-12">
        {guides.map((g) => (
          <article key={g.slug} id={g.slug} className="scroll-mt-24">
            <Markdown body={`## ${g.title}\n\n${g.body}`} idPrefix={`${g.slug}--`} />
          </article>
        ))}
      </div>
    </div>
  );
}

// ───────── Section ─────────

export function HelpSectionPage() {
  const { section = '' } = useParams();
  const s = getSection(section);
  useScrollToHash(section);

  if (!s) return <NotFound />;

  return (
    <div>
      <Breadcrumb trail={[{ label: 'Help', to: '/help' }]} current={s.name} />
      <PageHeader title={s.name} />

      <nav className="card mb-8 p-4">
        <Contents guides={s.guides} prefixIds />
      </nav>

      <div className="space-y-12">
        {s.guides.map((g) => (
          <article key={g.slug} id={g.slug} className="scroll-mt-24">
            <Markdown body={`## ${g.title}\n\n${g.body}`} idPrefix={`${g.slug}--`} />
          </article>
        ))}
      </div>
    </div>
  );
}

// ───────── Single guide ─────────

export function GuidePage() {
  const { slug = '' } = useParams();
  const guide = getGuide(slug);
  useScrollToHash(slug);

  if (!guide) return <NotFound />;

  const headings = extractHeadings(guide.body);
  const sectionSlug = slugify(guide.category);

  return (
    <div>
      <Breadcrumb
        trail={[
          { label: 'Help', to: '/help' },
          { label: guide.category, to: `/help/section/${sectionSlug}` },
        ]}
        current={guide.title}
      />

      <div className="lg:flex lg:gap-8">
        <article className="min-w-0 flex-1">
          <Markdown body={`# ${guide.title}\n\n${guide.body}`} />
        </article>

        {headings.length > 0 && (
          <aside className="mt-8 shrink-0 lg:mt-0 lg:w-56">
            <div className="sticky top-6">
              <div className="label mb-2">On this page</div>
              <ul className="space-y-1 text-sm">
                {headings.map((h) => (
                  <li key={h.id} className={h.depth === 3 ? 'ml-3' : ''}>
                    <a href={`#${h.id}`} className="text-ink-500 hover:text-accent dark:text-ink-400">
                      {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ───────── shared bits ─────────

function Breadcrumb({
  trail,
  current,
}: {
  trail: { label: string; to: string }[];
  current: string;
}) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-ink-500 dark:text-ink-400">
      {trail.map((t) => (
        <span key={t.to} className="flex items-center gap-1">
          <Link to={t.to} className="hover:text-accent">
            {t.label}
          </Link>
          <ChevronRight size={14} />
        </span>
      ))}
      <span className="text-ink-700 dark:text-ink-200">{current}</span>
    </nav>
  );
}

function NotFound() {
  return (
    <div>
      <Link className="btn-ghost mb-4" to="/help">
        <ArrowLeft size={16} /> Help
      </Link>
      <p className="text-sm text-ink-500">That guide doesn’t exist.</p>
    </div>
  );
}
