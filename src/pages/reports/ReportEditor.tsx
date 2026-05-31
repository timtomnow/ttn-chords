import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  GripVertical,
  Maximize2,
  PanelRight,
  Plus,
  Printer,
  Trash2,
  ZoomIn,
  ZoomOut,
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
import { Rnd } from 'react-rnd';
import {
  deleteReportTemplate,
  updateReportTemplate,
  useReportTemplate,
} from '@/db/repo';
import { newId } from '@/lib/id';
import {
  DEFAULT_FLOAT_H,
  floatingToPx,
  pageGeometry,
  pxToFloating,
} from '@/lib/report/geometry';
import { getBlock, listBlocks } from '@/lib/report/registry';
import '@/lib/report/blocks'; // register built-in blocks
import { PageFrame } from '@/components/report/PageFrame';
import { RenderBlock } from '@/components/report/RenderBlock';
import { ScaleBox } from '@/components/report/ScaleBox';
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
  const [zoom, setZoom] = useState(0.75);
  const [showInspector, setShowInspector] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const date = useMemo(() => new Date().toLocaleDateString(), []);
  const geo = useMemo(() => pageGeometry(pageSize, orientation), [pageSize, orientation]);

  // Fit the page width to the available canvas (accounts for the sidebar + the
  // inspector, at any screen size).
  const fit = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    setZoom(clamp(Number(((el.clientWidth - 32) / geo.widthPx).toFixed(2)), 0.25, 1.5));
  }, [geo.widthPx]);
  useLayoutEffect(() => {
    const r = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(r);
  }, [fit, showInspector]);
  const stepZoom = (d: number) =>
    setZoom((z) => clamp(Number((z + d).toFixed(2)), 0.25, 2));

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

  // ── mutations ──
  const updatePage = (pageId: string, fn: (p: ReportPage) => ReportPage) =>
    setPages((prev) => prev.map((p) => (p.id === pageId ? fn(p) : p)));

  function addBlock(type: ReportBlockType) {
    const def = getBlock(type);
    if (!def) return;
    const block: ReportBlock = {
      id: newId(),
      type,
      placement: def.defaultPlacement,
      config: def.defaultConfig(),
    };
    updatePage(activePageId, (p) => ({ ...p, blocks: [...p.blocks, block] }));
    setSel({ pageId: activePageId, blockId: block.id });
  }
  const patchBlock = (pageId: string, blockId: string, patch: Partial<ReportBlock>) =>
    updatePage(pageId, (p) => ({
      ...p,
      blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
  const patchConfig = (pageId: string, blockId: string, cfg: Record<string, unknown>) =>
    updatePage(pageId, (p) => ({
      ...p,
      blocks: p.blocks.map((b) =>
        b.id === blockId ? { ...b, config: { ...b.config, ...cfg } } : b,
      ),
    }));
  function deleteBlock(pageId: string, blockId: string) {
    updatePage(pageId, (p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== blockId) }));
    setSel(null);
  }
  function duplicateBlock(pageId: string, blockId: string) {
    updatePage(pageId, (p) => {
      const src = p.blocks.find((b) => b.id === blockId);
      if (!src) return p;
      const copy: ReportBlock = { ...src, id: newId(), config: { ...src.config } };
      if (src.placement.mode === 'floating') {
        copy.placement = {
          ...src.placement,
          x: clamp(src.placement.x + 3, 0, 90),
          y: clamp(src.placement.y + 3, 0, 90),
        };
      }
      return { ...p, blocks: [...p.blocks, copy] };
    });
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
    updatePage(pageId, (p) => {
      const flow = p.blocks.filter((b) => b.placement.mode === 'flow');
      const floating = p.blocks.filter((b) => b.placement.mode === 'floating');
      const from = flow.findIndex((b) => b.id === activeId);
      const to = flow.findIndex((b) => b.id === overId);
      if (from < 0 || to < 0) return p;
      return { ...p, blocks: [...arrayMove(flow, from, to), ...floating] };
    });
  }
  function addPage() {
    const page: ReportPage = { id: newId(), blocks: [] };
    setPages((prev) => [...prev, page]);
    setActivePageId(page.id);
  }
  function deletePage(pageId: string) {
    if (pages.length <= 1 || !confirm('Delete this page?')) return;
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
        <input className="input max-w-xs flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="input w-auto" value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)}>
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

        <div className="flex items-center gap-0.5 rounded-xl bg-ink-100 p-0.5 dark:bg-ink-800">
          <button className="btn-ghost px-2 py-1" onClick={() => stepZoom(-0.1)} title="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button className="btn-ghost w-12 px-1 py-1 text-xs tabular-nums" onClick={fit} title="Fit to width">
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn-ghost px-2 py-1" onClick={() => stepZoom(0.1)} title="Zoom in">
            <ZoomIn size={15} />
          </button>
          <button className="btn-ghost px-2 py-1" onClick={fit} title="Fit to width">
            <Maximize2 size={15} />
          </button>
        </div>
        <button
          className={`btn-ghost px-2 py-1 ${showInspector ? 'text-accent' : ''}`}
          onClick={() => setShowInspector((s) => !s)}
          title="Toggle panel"
        >
          <PanelRight size={16} />
        </button>

        <button className="btn-primary" onClick={() => navigate(`/reports/${template.id}/print`)}>
          <Printer size={15} /> Print / PDF
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Canvas */}
        <div ref={canvasRef} className="min-w-0 flex-1 overflow-auto rounded-2xl bg-ink-100 p-4 dark:bg-ink-950">
          <div className="flex flex-col items-center gap-6">
            {pages.map((page, i) => (
              <EditPage
                key={page.id}
                template={draft}
                page={page}
                pageIndex={i}
                geo={geo}
                date={date}
                zoom={zoom}
                sel={sel}
                sensors={sensors}
                isActive={activePageId === page.id}
                canDelete={pages.length > 1}
                onActivate={() => setActivePageId(page.id)}
                onDeletePage={() => deletePage(page.id)}
                onSelect={(blockId) => {
                  setActivePageId(page.id);
                  setSel({ pageId: page.id, blockId });
                }}
                onDeselect={() => setSel(null)}
                onPlacement={(blockId, placement) => patchBlock(page.id, blockId, { placement })}
                onReorderFlow={(a, b) => reorderFlow(page.id, a, b)}
              />
            ))}
            <button className="btn-secondary" onClick={addPage}>
              <Plus size={15} /> Add page
            </button>
          </div>
        </div>

        {/* Inspector */}
        {showInspector && (
          <aside className="shrink-0 space-y-4 lg:w-80">
            {selectedBlock && sel ? (
              <BlockInspector
                block={selectedBlock}
                pages={pages}
                pageId={sel.pageId}
                onConfig={(cfg) => patchConfig(sel.pageId, sel.blockId, cfg)}
                onScale={(scale) => patchBlock(sel.pageId, sel.blockId, { scale })}
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
                      <button key={def.type} className="btn-secondary justify-start" onClick={() => addBlock(def.type)}>
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
        )}
      </div>
    </div>
  );
}

function pageIndexOf(pages: ReportPage[], id: string): number {
  return Math.max(0, pages.findIndex((p) => p.id === id));
}

// ─────────────────────────────────────────────────────────────────────────
// Interactive page (editor)
// ─────────────────────────────────────────────────────────────────────────

function EditPage({
  template,
  page,
  pageIndex,
  geo,
  date,
  zoom,
  sel,
  sensors,
  isActive,
  canDelete,
  onActivate,
  onDeletePage,
  onSelect,
  onDeselect,
  onPlacement,
  onReorderFlow,
}: {
  template: ReportTemplate;
  page: ReportPage;
  pageIndex: number;
  geo: ReturnType<typeof pageGeometry>;
  date: string;
  zoom: number;
  sel: Sel;
  sensors: ReturnType<typeof useSensors>;
  isActive: boolean;
  canDelete: boolean;
  onActivate: () => void;
  onDeletePage: () => void;
  onSelect: (blockId: string) => void;
  onDeselect: () => void;
  onPlacement: (blockId: string, placement: BlockPlacement) => void;
  onReorderFlow: (activeId: string, overId: string) => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [sheets, setSheets] = useState(1);

  // How many physical sheets the page's content currently spans (for the label).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSheets(Math.max(1, Math.ceil(el.offsetHeight / geo.contentHeightPx - 0.02))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [geo.contentHeightPx]);

  const flow = page.blocks.filter((b) => b.placement.mode === 'flow');
  const floating = page.blocks.filter((b) => b.placement.mode === 'floating');

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) onReorderFlow(String(active.id), String(over.id));
  }

  const flowNode = (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={flow.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {flow.map((b) => (
          <FlowItem key={b.id} block={b} zoom={zoom} selected={sel?.blockId === b.id} onSelect={() => onSelect(b.id)} />
        ))}
      </SortableContext>
      {flow.length === 0 && (
        <p className="py-8 text-center text-xs text-ink-300 dark:text-ink-600">Add blocks from the panel →</p>
      )}
    </DndContext>
  );

  const floatingNode = floating.map((b) =>
    b.placement.mode === 'floating' ? (
      <FloatingItem
        key={b.id}
        block={b}
        geo={geo}
        zoom={zoom}
        selected={sel?.blockId === b.id}
        onSelect={() => onSelect(b.id)}
        onChange={(placement) => onPlacement(b.id, placement)}
      />
    ) : null,
  );

  return (
    <div style={{ width: geo.widthPx * zoom }}>
      <div className="mb-1 flex items-center justify-between px-1 text-xs text-ink-500">
        <button className={isActive ? 'font-semibold text-accent' : ''} onClick={onActivate}>
          Page {pageIndex + 1}
          {isActive ? ' · active' : ''}
          {sheets > 1 ? ` · ${sheets} sheets` : ''}
        </button>
        {canDelete && (
          <button className="btn-ghost px-1 py-0.5" onClick={onDeletePage}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <PageScaler zoom={zoom} width={geo.widthPx}>
        <div
          className="shadow-lg ring-1 ring-ink-300 dark:ring-ink-700"
          onClick={() => {
            onActivate();
            onDeselect();
          }}
        >
          <PageFrame
            template={template}
            geo={geo}
            pageIndex={pageIndex}
            date={date}
            contentRef={contentRef}
            flow={flowNode}
            floating={floatingNode}
          />
        </div>
      </PageScaler>
    </div>
  );
}

function FlowItem({
  block,
  zoom,
  selected,
  onSelect,
}: {
  block: ReportBlock;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  // The page is CSS-scaled by `zoom`; divide dnd-kit's translate by zoom so the
  // dragged block tracks the pointer.
  const t = transform ? { ...transform, x: transform.x / zoom, y: transform.y / zoom } : transform;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(t), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`group relative rounded p-1 transition ${
        selected ? 'ring-2 ring-accent' : 'ring-1 ring-transparent hover:ring-ink-200 dark:hover:ring-ink-700'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
        className="absolute -left-6 top-1 hidden cursor-grab text-ink-400 group-hover:block"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <ScaleBox scale={block.scale ?? 1}>
        <RenderBlock block={block} mode="screen" />
      </ScaleBox>
    </div>
  );
}

function FloatingItem({
  block,
  geo,
  zoom,
  selected,
  onSelect,
  onChange,
}: {
  block: ReportBlock;
  geo: ReturnType<typeof pageGeometry>;
  zoom: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (placement: BlockPlacement) => void;
}) {
  if (block.placement.mode !== 'floating') return null;
  const px = floatingToPx(geo, block.placement);
  return (
    <Rnd
      size={{ width: px.width, height: px.height }}
      position={{ x: px.x, y: px.y }}
      scale={zoom}
      bounds="parent"
      minWidth={24}
      minHeight={24}
      onMouseDown={onSelect}
      onDragStart={onSelect}
      onDragStop={(_e, d) =>
        onChange({ mode: 'floating', ...pxToFloating(geo, { ...d, width: px.width, height: px.height }) })
      }
      onResizeStart={onSelect}
      onResizeStop={(_e, _dir, ref, _delta, pos) =>
        onChange({
          mode: 'floating',
          ...pxToFloating(geo, { x: pos.x, y: pos.y, width: ref.offsetWidth, height: ref.offsetHeight }),
        })
      }
      className={`z-10 ${selected ? 'ring-2 ring-accent' : 'ring-1 ring-dashed ring-ink-400/60'}`}
    >
      <div className="h-full w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <RenderBlock block={block} mode="screen" />
      </div>
    </Rnd>
  );
}

// Reserves correctly-scaled layout space for a CSS-transformed page (transform
// alone wouldn't shrink the box). Measures the unscaled child height live.
function PageScaler({ zoom, width, children }: { zoom: number; width: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ width: width * zoom, height: height * zoom }}>
      <div ref={ref} style={{ width, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Inspector
// ─────────────────────────────────────────────────────────────────────────

function BlockInspector({
  block,
  pages,
  pageId,
  onConfig,
  onScale,
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
  onScale: (scale: number) => void;
  onPlacement: (placement: BlockPlacement) => void;
  onMovePage: (toPage: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const def = getBlock(block.type);
  const floating = block.placement.mode === 'floating';
  const scale = block.scale ?? 1;

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
          <button className={`chip ${!floating ? 'chip-active' : ''}`} onClick={() => onPlacement({ mode: 'flow' })}>
            In flow
          </button>
          <button
            className={`chip ${floating ? 'chip-active' : ''}`}
            onClick={() =>
              onPlacement(
                block.placement.mode === 'floating'
                  ? block.placement
                  : { mode: 'floating', x: 10, y: 10, w: 40, h: 25 },
              )
            }
          >
            Floating
          </button>
        </div>

        {/* Sizing: ONE mechanism per placement. */}
        {floating && block.placement.mode === 'floating' ? (
          <p className="text-[11px] text-ink-400">
            Drag the block to move it; drag its handles to resize. Or set width/height:
          </p>
        ) : (
          <label className="block">
            <span className="label mb-1 flex items-center justify-between">
              <span>Size {Math.round(scale * 100)}%</span>
              {scale !== 1 && (
                <button className="text-xs text-accent" onClick={() => onScale(1)}>
                  Reset
                </button>
              )}
            </span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={scale}
              onChange={(e) => onScale(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </label>
        )}

        {block.placement.mode === 'floating' &&
          (() => {
            const fp = block.placement; // narrowed const → safe inside the closures
            return (
              <div className="grid grid-cols-2 gap-2">
                <PctField label="Width" value={fp.w} onChange={(w) => onPlacement({ ...fp, w })} />
                <PctField
                  label="Height"
                  value={fp.h ?? DEFAULT_FLOAT_H}
                  onChange={(h) => onPlacement({ ...fp, h })}
                />
              </div>
            );
          })()}
      </div>

      {pages.length > 1 && (
        <label className="block">
          <span className="label mb-1">Move to page</span>
          <select className="input" value={pageId} onChange={(e) => onMovePage(e.target.value)}>
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

function PctField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="label mb-1">
        {label} {Math.round(value)}%
      </span>
      <input
        type="range"
        min={8}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}

function ChromeEditor({ chrome, onChange }: { chrome: ReportChrome; onChange: (c: ReportChrome) => void }) {
  return (
    <section className="card space-y-3 p-4">
      <h3 className="label">Header &amp; footer</h3>
      <p className="text-[11px] text-ink-400">
        Tokens: {'{page}'} {'{pages}'} {'{title}'} {'{date}'}
      </p>
      <BandFields label="Header" band={chrome.header} onChange={(b) => onChange({ ...chrome, header: b })} />
      <BandFields label="Footer" band={chrome.footer} onChange={(b) => onChange({ ...chrome, footer: b })} />
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
