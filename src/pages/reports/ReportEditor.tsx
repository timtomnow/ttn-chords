import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  GripVertical,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  deleteReportTemplate,
  updateReportTemplate,
  useReportTemplate,
} from '@/db/repo';
import { newId } from '@/lib/id';
import { floatingStyle, pageGeometry } from '@/lib/report/geometry';
import { footerForPage, headerForPage, type TokenContext } from '@/lib/report/tokens';
import { getBlock, listBlocks } from '@/lib/report/registry';
import '@/lib/report/blocks'; // register built-in blocks
import { RenderBlock } from '@/components/report/RenderBlock';
import { PageFooterBand, PageHeaderBand } from '@/components/report/PageBands';
import type {
  BlockPlacement,
  Orientation,
  PageSize,
  ReportBand,
  ReportBlock,
  ReportBlockType,
  ReportChrome,
  ReportPage,
  ReportTemplate,
} from '@/types';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function ReportEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const template = useReportTemplate(id);

  if (template === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (template === null) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate('/reports')}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-ink-500">Report not found.</p>
      </div>
    );
  }
  return <Editor key={template.id} template={template} />;
}

type Sel = { pageId: string; blockId: string } | null;

function Editor({ template }: { template: ReportTemplate }) {
  const navigate = useNavigate();
  const [name, setName] = useState(template.name);
  const [pageSize, setPageSize] = useState<PageSize>(template.pageSize);
  const [orientation, setOrientation] = useState<Orientation>(template.orientation);
  const [chrome, setChrome] = useState<ReportChrome>(template.chrome ?? {});
  const [pages, setPages] = useState<ReportPage[]>(template.pages);
  const [saved, setSaved] = useState(true);
  const [sel, setSel] = useState<Sel>(null);
  const [activePageId, setActivePageId] = useState(template.pages[0]?.id ?? '');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const date = useMemo(() => new Date().toLocaleDateString(), []);
  const geo = useMemo(() => pageGeometry(pageSize, orientation), [pageSize, orientation]);

  // Debounced autosave (mirrors the song/setlist editors).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaved(false);
    const h = setTimeout(() => {
      void updateReportTemplate(template.id, {
        name: name.trim() || 'Untitled report',
        pageSize,
        orientation,
        chrome,
        pages,
      }).then(() => setSaved(true));
    }, 500);
    return () => clearTimeout(h);
  }, [name, pageSize, orientation, chrome, pages, template.id]);

  // ── page/block mutations ──
  function addBlock(type: ReportBlockType) {
    const def = getBlock(type);
    if (!def) return;
    const block: ReportBlock = {
      id: newId(),
      type,
      placement: def.defaultPlacement,
      config: def.defaultConfig(),
    };
    setPages((prev) =>
      prev.map((p) => (p.id === activePageId ? { ...p, blocks: [...p.blocks, block] } : p)),
    );
    setSel({ pageId: activePageId, blockId: block.id });
  }
  function patchBlock(pageId: string, blockId: string, patch: Partial<ReportBlock>) {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? { ...p, blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }
          : p,
      ),
    );
  }
  function patchConfig(pageId: string, blockId: string, cfg: Record<string, unknown>) {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId
          ? {
              ...p,
              blocks: p.blocks.map((b) =>
                b.id === blockId ? { ...b, config: { ...b.config, ...cfg } } : b,
              ),
            }
          : p,
      ),
    );
  }
  function deleteBlock(pageId: string, blockId: string) {
    setPages((prev) =>
      prev.map((p) =>
        p.id === pageId ? { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) } : p,
      ),
    );
    setSel(null);
  }
  function duplicateBlock(pageId: string, blockId: string) {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        const src = p.blocks.find((b) => b.id === blockId);
        if (!src) return p;
        const copy: ReportBlock = { ...src, id: newId(), config: { ...src.config } };
        if (src.placement.mode === 'floating') {
          copy.placement = {
            ...src.placement,
            x: clamp(src.placement.x + 3, 0, 95),
            y: clamp(src.placement.y + 3, 0, 95),
          };
        }
        return { ...p, blocks: [...p.blocks, copy] };
      }),
    );
  }
  function moveBlockToPage(fromPageId: string, blockId: string, toPageId: string) {
    if (fromPageId === toPageId) return;
    setPages((prev) => {
      const block = prev.find((p) => p.id === fromPageId)?.blocks.find((b) => b.id === blockId);
      if (!block) return prev;
      return prev.map((p) => {
        if (p.id === fromPageId) return { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) };
        if (p.id === toPageId) return { ...p, blocks: [...p.blocks, block] };
        return p;
      });
    });
    setSel({ pageId: toPageId, blockId });
  }
  function reorderFlow(pageId: string, activeId: string, overId: string) {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        const flow = p.blocks.filter((b) => b.placement.mode === 'flow');
        const floating = p.blocks.filter((b) => b.placement.mode === 'floating');
        const from = flow.findIndex((b) => b.id === activeId);
        const to = flow.findIndex((b) => b.id === overId);
        if (from < 0 || to < 0) return p;
        return { ...p, blocks: [...arrayMove(flow, from, to), ...floating] };
      }),
    );
  }

  function addPage() {
    const page: ReportPage = { id: newId(), blocks: [] };
    setPages((prev) => [...prev, page]);
    setActivePageId(page.id);
  }
  function deletePage(pageId: string) {
    if (pages.length <= 1) return;
    if (!confirm('Delete this page?')) return;
    setPages((prev) => prev.filter((p) => p.id !== pageId));
    if (activePageId === pageId) setActivePageId(pages.find((p) => p.id !== pageId)?.id ?? '');
    if (sel?.pageId === pageId) setSel(null);
  }

  async function onDelete() {
    if (!confirm('Delete this report?')) return;
    await deleteReportTemplate(template.id);
    navigate('/reports');
  }

  const draft: ReportTemplate = { ...template, name, pageSize, orientation, chrome, pages };
  const selectedBlock =
    sel && pages.find((p) => p.id === sel.pageId)?.blocks.find((b) => b.id === sel.blockId);

  return (
    <div>
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost -ml-2" onClick={() => navigate('/reports')}>
          <ArrowLeft size={16} /> Reports
        </button>
        <input
          className="input max-w-xs flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="input w-auto"
          value={pageSize}
          onChange={(e) => setPageSize(e.target.value as PageSize)}
        >
          <option value="letter">Letter</option>
          <option value="a4">A4</option>
          <option value="legal">Legal</option>
        </select>
        <select
          className="input w-auto"
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as Orientation)}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
        <span className="flex items-center gap-1 text-xs text-ink-400">
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : (
            'Saving…'
          )}
        </span>
        <button
          className="btn-primary"
          onClick={() => navigate(`/reports/${template.id}/print`)}
        >
          <Printer size={15} /> Print / PDF
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Canvas */}
        <div className="min-w-0 flex-1 overflow-auto rounded-2xl bg-ink-100 p-4 dark:bg-ink-950">
          <div className="flex flex-col items-center gap-6">
            {pages.map((page, i) => (
              <div key={page.id} className="space-y-1">
                <div className="flex items-center justify-between px-1 text-xs text-ink-500">
                  <button
                    className={activePageId === page.id ? 'font-semibold text-accent' : ''}
                    onClick={() => setActivePageId(page.id)}
                  >
                    Page {i + 1}
                    {activePageId === page.id ? ' (active)' : ''}
                  </button>
                  {pages.length > 1 && (
                    <button className="btn-ghost px-1 py-0.5" onClick={() => deletePage(page.id)}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <EditPage
                  template={draft}
                  page={page}
                  pageIndex={i}
                  geo={geo}
                  date={date}
                  sel={sel}
                  sensors={sensors}
                  onSelect={(blockId) => {
                    setActivePageId(page.id);
                    setSel({ pageId: page.id, blockId });
                  }}
                  onSelectPage={() => {
                    setActivePageId(page.id);
                    setSel(null);
                  }}
                  onMoveFloating={(blockId, placement) =>
                    patchBlock(page.id, blockId, { placement })
                  }
                  onReorderFlow={(a, b) => reorderFlow(page.id, a, b)}
                />
              </div>
            ))}
            <button className="btn-secondary" onClick={addPage}>
              <Plus size={15} /> Add page
            </button>
          </div>
        </div>

        {/* Inspector */}
        <aside className="shrink-0 space-y-4 lg:w-80">
          {selectedBlock && sel ? (
            <BlockInspector
              block={selectedBlock}
              pages={pages}
              pageId={sel.pageId}
              onConfig={(cfg) => patchConfig(sel.pageId, sel.blockId, cfg)}
              onPlacement={(placement) => patchBlock(sel.pageId, sel.blockId, { placement })}
              onMovePage={(toPage) => moveBlockToPage(sel.pageId, sel.blockId, toPage)}
              onDuplicate={() => duplicateBlock(sel.pageId, sel.blockId)}
              onDelete={() => deleteBlock(sel.pageId, sel.blockId)}
              onDeselect={() => setSel(null)}
            />
          ) : (
            <>
              <section className="card p-4">
                <h3 className="label mb-2">Add block to page {pageIndexOf(pages, activePageId) + 1}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {listBlocks().map((def) => (
                    <button
                      key={def.type}
                      className="btn-secondary justify-start"
                      onClick={() => addBlock(def.type)}
                    >
                      <def.icon size={15} /> {def.label}
                    </button>
                  ))}
                </div>
              </section>

              <ChromeEditor chrome={chrome} onChange={setChrome} />

              <button className="btn-danger w-full" onClick={onDelete}>
                <Trash2 size={15} /> Delete report
              </button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function pageIndexOf(pages: ReportPage[], id: string): number {
  return Math.max(0, pages.findIndex((p) => p.id === id));
}

// ─────────────────────────────────────────────────────────────────────────
// Interactive page surface (editor mirror of ReportPageSurface)
// ─────────────────────────────────────────────────────────────────────────

function EditPage({
  template,
  page,
  pageIndex,
  geo,
  date,
  sel,
  sensors,
  onSelect,
  onSelectPage,
  onMoveFloating,
  onReorderFlow,
}: {
  template: ReportTemplate;
  page: ReportPage;
  pageIndex: number;
  geo: ReturnType<typeof pageGeometry>;
  date: string;
  sel: Sel;
  sensors: ReturnType<typeof useSensors>;
  onSelect: (blockId: string) => void;
  onSelectPage: () => void;
  onMoveFloating: (blockId: string, placement: BlockPlacement) => void;
  onReorderFlow: (activeId: string, overId: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const ctx: TokenContext = {
    page: pageIndex + 1,
    pages: template.pages.length,
    title: template.name,
    date,
  };
  const header = headerForPage(template.chrome, pageIndex);
  const footer = footerForPage(template.chrome, pageIndex);

  const flow = page.blocks.filter((b) => b.placement.mode === 'flow');
  const floating = page.blocks.filter((b) => b.placement.mode === 'floating');

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) onReorderFlow(String(active.id), String(over.id));
  }

  return (
    <div
      className="relative bg-white text-ink-900 shadow-lg ring-1 ring-ink-300 dark:ring-ink-700"
      style={{ width: geo.widthPx, minHeight: geo.heightPx, padding: geo.marginPx }}
      onClick={onSelectPage}
    >
      <div ref={contentRef} className="relative" style={{ minHeight: geo.contentHeightPx }}>
        <PageHeaderBand band={header} ctx={ctx} />
        <PageFooterBand band={footer} ctx={ctx} />

        {/* Flow column */}
        <div style={{ paddingTop: header ? 32 : 0, paddingBottom: footer ? 32 : 0 }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={flow.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {flow.map((b) => (
                  <FlowBlock
                    key={b.id}
                    block={b}
                    selected={sel?.blockId === b.id}
                    onSelect={() => onSelect(b.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {flow.length === 0 && (
            <p className="py-8 text-center text-xs text-ink-300 dark:text-ink-600">
              Add blocks from the panel →
            </p>
          )}
        </div>

        {/* Floating layer */}
        {floating.map((b) =>
          b.placement.mode === 'floating' ? (
            <FloatingBlock
              key={b.id}
              block={b}
              geo={geo}
              contentRef={contentRef}
              selected={sel?.blockId === b.id}
              onSelect={() => onSelect(b.id)}
              onMove={(placement) => onMoveFloating(b.id, placement)}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function FlowBlock({
  block,
  selected,
  onSelect,
}: {
  block: ReportBlock;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`group relative rounded-lg p-1 transition ${
        selected ? 'ring-2 ring-accent' : 'ring-1 ring-transparent hover:ring-ink-200 dark:hover:ring-ink-700'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute -left-6 top-1 hidden cursor-grab text-ink-400 group-hover:block"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <RenderBlock block={block} mode="screen" />
    </div>
  );
}

function FloatingBlock({
  block,
  geo,
  contentRef,
  selected,
  onSelect,
  onMove,
}: {
  block: ReportBlock;
  geo: ReturnType<typeof pageGeometry>;
  contentRef: RefObject<HTMLDivElement>;
  selected: boolean;
  onSelect: () => void;
  onMove: (placement: BlockPlacement) => void;
}) {
  if (block.placement.mode !== 'floating') return null;
  const pos = block.placement;

  function startDrag(e: ReactPointerEvent, mode: 'move' | 'resize') {
    e.stopPropagation();
    onSelect();
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: pos.x, y: pos.y, w: pos.w };
    function onMoveEv(ev: PointerEvent) {
      const dx = ((ev.clientX - startX) / rect!.width) * 100;
      const dy = ((ev.clientY - startY) / rect!.height) * 100;
      if (mode === 'move') {
        onMove({ ...pos, x: clamp(orig.x + dx, 0, 100), y: clamp(orig.y + dy, 0, 100) });
      } else {
        onMove({ ...pos, w: clamp(orig.w + dx, 8, 100) });
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMoveEv);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMoveEv);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div
      style={floatingStyle(geo, pos)}
      onPointerDown={(e) => startDrag(e, 'move')}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`cursor-move rounded-lg ${
        selected ? 'ring-2 ring-accent' : 'ring-1 ring-ink-300 dark:ring-ink-700'
      }`}
    >
      <RenderBlock block={block} mode="screen" />
      {selected && (
        <span
          onPointerDown={(e) => startDrag(e, 'resize')}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize rounded-full bg-accent"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inspector panels
// ─────────────────────────────────────────────────────────────────────────

function BlockInspector({
  block,
  pages,
  pageId,
  onConfig,
  onPlacement,
  onMovePage,
  onDuplicate,
  onDelete,
  onDeselect,
}: {
  block: ReportBlock;
  pages: ReportPage[];
  pageId: string;
  onConfig: (cfg: Record<string, unknown>) => void;
  onPlacement: (placement: BlockPlacement) => void;
  onMovePage: (toPage: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const def = getBlock(block.type);
  const floating = block.placement.mode === 'floating';

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{def?.label ?? block.type}</h3>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={onDeselect}>
          Done
        </button>
      </div>

      {def?.Editor && <def.Editor block={block} onChange={onConfig} />}

      <div className="space-y-2 border-t border-ink-200 pt-3 dark:border-ink-800">
        <span className="label">Placement</span>
        <div className="flex gap-1">
          <button
            className={`chip ${!floating ? 'chip-active' : ''}`}
            onClick={() => onPlacement({ mode: 'flow' })}
          >
            Flow
          </button>
          <button
            className={`chip ${floating ? 'chip-active' : ''}`}
            onClick={() =>
              onPlacement(
                block.placement.mode === 'floating'
                  ? block.placement
                  : { mode: 'floating', x: 10, y: 10, w: 40 },
              )
            }
          >
            Floating
          </button>
        </div>
        {block.placement.mode === 'floating' && (
          <label className="block">
            <span className="label mb-1">Width {Math.round(block.placement.w)}%</span>
            <input
              type="range"
              min={8}
              max={100}
              step={1}
              value={block.placement.w}
              onChange={(e) =>
                block.placement.mode === 'floating' &&
                onPlacement({ ...block.placement, w: Number(e.target.value) })
              }
              className="w-full accent-accent"
            />
          </label>
        )}
      </div>

      {pages.length > 1 && (
        <label className="block">
          <span className="label mb-1">Move to page</span>
          <select
            className="input"
            value={pageId}
            onChange={(e) => onMovePage(e.target.value)}
          >
            {pages.map((p, i) => (
              <option key={p.id} value={p.id}>
                Page {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={onDuplicate}>
          <Copy size={14} /> Duplicate
        </button>
        <button className="btn-danger flex-1" onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </section>
  );
}

function ChromeEditor({
  chrome,
  onChange,
}: {
  chrome: ReportChrome;
  onChange: (c: ReportChrome) => void;
}) {
  return (
    <section className="card space-y-3 p-4">
      <h3 className="label">Header &amp; footer</h3>
      <p className="text-[11px] text-ink-400">
        Tokens: {'{page}'} {'{pages}'} {'{title}'} {'{date}'}
      </p>

      <BandFields
        label="Header"
        band={chrome.header}
        onChange={(b) => onChange({ ...chrome, header: b })}
      />
      <BandFields
        label="Footer"
        band={chrome.footer}
        onChange={(b) => onChange({ ...chrome, footer: b })}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={chrome.firstPageDifferent ?? false}
          onChange={(e) => onChange({ ...chrome, firstPageDifferent: e.target.checked })}
        />
        First page different
      </label>
      {chrome.firstPageDifferent && (
        <>
          <BandFields
            label="First-page header"
            band={chrome.firstHeader}
            onChange={(b) => onChange({ ...chrome, firstHeader: b })}
          />
          <BandFields
            label="First-page footer"
            band={chrome.firstFooter}
            onChange={(b) => onChange({ ...chrome, firstFooter: b })}
          />
        </>
      )}
    </section>
  );
}

function BandFields({
  label,
  band,
  onChange,
}: {
  label: string;
  band: ReportBand | undefined;
  onChange: (b: ReportBand) => void;
}) {
  const b = band ?? {};
  return (
    <div>
      <span className="label mb-1">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {(['left', 'center', 'right'] as const).map((slot) => (
          <input
            key={slot}
            className="input px-2 py-1 text-xs"
            placeholder={slot}
            value={b[slot] ?? ''}
            onChange={(e) => onChange({ ...b, [slot]: e.target.value })}
          />
        ))}
      </div>
    </div>
  );
}
