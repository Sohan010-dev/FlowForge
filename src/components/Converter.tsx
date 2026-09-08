import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  FileText,
  Image as ImageIcon,
  Minimize2,
  Workflow,
  Loader2,
  Maximize2,
  RotateCcw,
  Save,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import mermaid from "mermaid";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { snapdom } from "@zumer/snapdom";
import { SocialLinks } from "@/components/SocialLinks";
import { extractText, type ExtractProgress } from "@/lib/extract";
import {
  buildFlowchart,
  detectStructure,
  type FlowchartResult,
} from "@/lib/flowchart";

/** Zoom that fits the diagram to the canvas width, capped for readability. */
function computeFitZoom(
  w: number | null,
  h: number | null,
  scrollEl: HTMLDivElement | null,
): number {
  if (!w || !h || !scrollEl) return 1;
  const pad = 48;
  const availW = scrollEl.clientWidth - pad;
  if (availW <= 0) return 1;
  const fitW = availW / w;
  // Never scale below 0.75 (text gets small) nor above 1.15 (pointless blowup).
  return Math.min(1.15, Math.max(0.75, fitW));
}

type Stage =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | {
      kind: "parsing";
      page: number;
      total: number;
      label: string;
    }
  | { kind: "rendering" }
  | {
      kind: "done";
      result: FlowchartResult;
      fileName: string;
      sourceKind: string;
    };

let mermaidId = 0;

export default function Converter() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fsScrollRef = useRef<HTMLDivElement>(null);
  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null);
  const svgHtmlRef = useRef<string>("");

  // Configure mermaid once for the dark blue theme.
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      themeVariables: {
        background: "transparent",
        primaryColor: "#1a2340",
        primaryBorderColor: "#6366f1",
        primaryTextColor: "#e6ebf7",
        lineColor: "#818cf8",
        secondaryColor: "#141b33",
        tertiaryColor: "#10162b",
        clusterBkg: "rgba(99,102,241,0.06)",
        clusterBorder: "#4f46e5",
        edgeLabelBackground: "#0b1020",
        fontSize: "16px",
      },
      flowchart: {
        curve: "basis",
        padding: 20,
        // Natural-size SVG — never shrink to fit container (that's what made
        // charts unreadably small). The canvas scrolls and we zoom instead.
        useMaxWidth: false,
        htmlLabels: true,
        nodeSpacing: 45,
        rankSpacing: 55,
      },
    });
  }, []);

  const reset = () => {
    setStage({ kind: "idle" });
    setZoom(1);
    naturalSizeRef.current = null;
    svgHtmlRef.current = "";
    if (svgHostRef.current) svgHostRef.current.innerHTML = "";
  };

  /** Sizes the SVG element to natural dimensions × zoom so scrolling works. */
  const applyZoom = (z: number) => {
    const nat = naturalSizeRef.current;
    if (!nat) return;
    const svg =
      (isFullscreen ? fsScrollRef.current : svgHostRef.current)?.querySelector(
        "svg",
      ) ?? svgRef.current;
    if (!svg) return;
    svg.style.width = `${Math.round(nat.w * z)}px`;
    svg.style.height = `${Math.round(nat.h * z)}px`;
  };

  useEffect(() => {
    applyZoom(zoom);
  }, [zoom, isFullscreen]);

  const fitToWidth = () => {
    const z = computeFitZoom(
      naturalSizeRef.current?.w ?? null,
      naturalSizeRef.current?.h ?? null,
      scrollRef.current,
    );
    setZoom(z);
    applyZoom(z);
  };

  /** Scrolls the active canvas sideways (dir: -1 left, 1 right). */
  const panHorizontally = (dir: -1 | 1) => {
    const el = isFullscreen ? fsScrollRef.current : scrollRef.current;
    el?.scrollBy({ left: dir * 380, behavior: "smooth" });
  };

  /**
   * Cursor drag-to-pan: hold and move anywhere on the canvas. Works in both
   * normal and fullscreen views (mouse + touch via pointer events).
   */
  const dragState = useRef<{ active: boolean; x: number; y: number } | null>(
    null,
  );
  const onPanPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't hijack clicks on interactive children (none expected, but safe).
    if ((e.target as HTMLElement).closest("button, a")) return;
    const el = isFullscreen ? fsScrollRef.current : scrollRef.current;
    if (!el) return;
    dragState.current = { active: true, x: e.clientX, y: e.clientY };
    el.setPointerCapture?.(e.pointerId);
    el.style.cursor = "grabbing";
  };
  const onPanPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    if (!st?.active) return;
    const el = isFullscreen ? fsScrollRef.current : scrollRef.current;
    if (!el) return;
    el.scrollLeft -= e.clientX - st.x;
    el.scrollTop -= e.clientY - st.y;
    st.x = e.clientX;
    st.y = e.clientY;
  };
  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current?.active) return;
    dragState.current = null;
    const el = isFullscreen ? fsScrollRef.current : scrollRef.current;
    if (el) {
      el.style.cursor = "";
      el.releasePointerCapture?.(e.pointerId);
    }
  };

  /** CSS-overlay fullscreen — works even where the Fullscreen API is blocked. */
  const toggleFullscreen = () => {
    setIsFullscreen((v) => !v);
    // Re-fit once the canvas has its new (much larger) size.
    window.setTimeout(fitToWidth, 80);
  };

  // Escape exits fullscreen; lock page scroll behind the overlay.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isFullscreen]);

  const processFile = async (file: File) => {
    const name = file.name.toLowerCase();
    const supported =
      file.type === "application/pdf" ||
      name.endsWith(".pdf") ||
      name.endsWith(".docx") ||
      name.endsWith(".doc") ||
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp)$/.test(name);
    if (!supported) {
      setStage({
        kind: "error",
        message: `"${file.name}" isn't a supported format. Upload a PDF, Word (doc/docx), JPG or PNG file.`,
      });
      toast.error("Unsupported file type");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStage({
        kind: "error",
        message: "That file is over 25 MB. Try a smaller one.",
      });
      toast.error("File too large (max 25 MB)");
      return;
    }

    try {
      const onProgress = (p: ExtractProgress) => {
        if (p.kind === "ocr") {
          setStage({
            kind: "parsing",
            page: p.page,
            total: p.total,
            label:
              p.total === 100
                ? "Reading text from image (OCR)…"
                : `Reading page ${p.page} of ${p.total}…`,
          });
        } else {
          setStage({
            kind: "parsing",
            page: 0,
            total: 0,
            label: p.detail ?? "Reading file…",
          });
        }
      };
      setStage({ kind: "parsing", page: 0, total: 0, label: "Opening file…" });
      const { pages, sourceKind } = await extractText(file, onProgress);

      setStage({ kind: "rendering" });
      // Yield a frame so the loading state paints before heavy work.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const nodes = detectStructure(pages);
      const result = buildFlowchart(nodes);
      if (result.nodes.length === 0) {
        setStage({
          kind: "error",
          message:
            "No readable text found — the file may be empty, corrupted, or a scan with no selectable text.",
        });
        return;
      }

      const renderId = `mmd-${++mermaidId}`;
      const { svg } = await mermaid.render(renderId, result.mermaid);
      svgHtmlRef.current = svg;
      if (svgHostRef.current) svgHostRef.current.innerHTML = svg;
      svgRef.current = svgHostRef.current?.querySelector("svg") ?? null;
      // Cache natural size and render at a readable default zoom.
      const el = svgRef.current;
      const w = el?.viewBox?.baseVal?.width || el?.clientWidth || 800;
      const h = el?.viewBox?.baseVal?.height || el?.clientHeight || 600;
      naturalSizeRef.current = { w, h };
      const defaultZoom = computeFitZoom(w, h, scrollRef.current);
      setZoom(defaultZoom);
      applyZoom(defaultZoom);
      setStage({ kind: "done", result, fileName: file.name, sourceKind });
      toast.success("Flowchart generated");
    } catch (err) {
      console.error(err);
      setStage({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong while reading that file.",
      });
      toast.error("Processing failed");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = "";
  };

  const copyMermaid = async () => {
    if (stage.kind !== "done") return;
    await navigator.clipboard.writeText(stage.result.mermaid);
    toast.success("Mermaid syntax copied");
  };

  /**
   * Saves the flowchart as a PNG image — no signup, fully local.
   * snapdom rasterizes the live SVG (HTML labels, fonts and all) onto an
   * opaque dark background so the file is visible in any image viewer.
   */
  const saveFlowchart = async () => {
    if (stage.kind !== "done" || !svgRef.current) return;
    try {
      toast.loading("Rendering image…", { id: "save" });
      await snapdom.download(svgRef.current, {
        format: "png",
        scale: 2,
        backgroundColor: "#0b1020",
        filename: stage.fileName.replace(/\.[^.]+$/, "") + "-flowchart",
      });
      toast.success("Flowchart saved as PNG", { id: "save" });
    } catch (err) {
      console.error("PNG export failed:", err);
      // Fallback: download the raw SVG markup instead.
      try {
        const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        // Force a dark, opaque background so text is visible on white viewers.
        clone.style.background = "#0b1020";
        const vb = clone.viewBox?.baseVal;
        if (vb?.width && vb?.height) {
          clone.setAttribute("width", String(vb.width));
          clone.setAttribute("height", String(vb.height));
        } else {
          const box = svgRef.current.getBBox();
          clone.setAttribute(
            "viewBox",
            `0 0 ${Math.ceil(box.width)} ${Math.ceil(box.height)}`,
          );
          clone.setAttribute("width", String(Math.ceil(box.width)));
          clone.setAttribute("height", String(Math.ceil(box.height)));
        }
        // Embed the app fonts so text renders outside the page context.
        clone.setAttribute(
          "style",
          `${clone.getAttribute("style") ?? ""}; font-family: Inter, Arial, sans-serif;`,
       );
        const blob = new Blob([clone.outerHTML], {
          type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download =
          stage.fileName.replace(/\.[^.]+$/, "") + "-flowchart.svg";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Saved as SVG instead", { id: "save" });
      } catch {
        toast.error("Could not save the flowchart", { id: "save" });
      }
    }
  };

  const busy =
    stage.kind === "parsing" || stage.kind === "rendering";
  const progress =
    stage.kind === "parsing" && stage.total > 0
      ? (stage.page / stage.total) * 100
      : stage.kind === "rendering"
        ? 100
        : 0;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 shadow-[0_0_16px_rgba(99,102,241,0.45)]">
              <Workflow className="size-4.5 text-white" strokeWidth={2.2} />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              Flow<span className="text-gradient-blue">Forge</span>
            </span>
          </a>
          <SocialLinks />
        </div>
      </header>

      {/* Split-screen workspace */}
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[380px_1fr]">
        {/* Left: upload + status */}
        <section className="flex flex-col gap-5">
          <div className="glass rounded-2xl p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]">
            <h1 className="font-display text-xl font-semibold tracking-tight">
              PDF · Word · Image → Flowchart
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Drop a file and watch it become a diagram. Everything runs in your
              browser — no uploads, no AI, no API keys.
            </p>

            {stage.kind === "idle" || stage.kind === "error" ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
                className={`mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${
                  dragActive
                    ? "border-primary bg-primary/10 shadow-[0_0_30px_rgba(99,102,241,0.25)]"
                    : "border-white/15 hover:border-primary/60 hover:bg-primary/5"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,image/png,image/jpeg,image/jpg,image/webp"
                  className="sr-only"
                  onChange={onPick}
                />
                <span
                  className={`flex size-12 items-center justify-center rounded-xl border transition-colors ${
                    dragActive
                      ? "border-primary/60 bg-primary/20 text-primary"
                      : "border-white/10 bg-white/5 text-muted-foreground"
                  }`}
                >
                  <Upload className="size-5" />
                </span>
                <span className="text-sm font-medium">
                  {dragActive ? "Drop it here" : "Drag & drop your file"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF · DOCX · DOC · JPG · PNG · max 25 MB
                </span>
              </label>
            ) : null}

            {stage.kind === "error" ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{stage.message}</span>
              </div>
            ) : null}

            {busy ? (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-2.5 text-sm">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span>
                    {stage.kind === "parsing"
                      ? stage.label
                      : "Laying out flowchart…"}
                  </span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            ) : null}

            {stage.kind === "done" ? (
              <div className="mt-5 space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={onPick}
                />
                <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-3">
                  <FileText className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {stage.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stage.result.stats.nodes} nodes ·{" "}
                      {stage.result.stats.headings} headings ·{" "}
                      {stage.result.stats.bullets} list items ·{" "}
                      {stage.sourceKind.toUpperCase()}
                    </p>
                  </div>
                  <Check className="ml-auto size-4 shrink-0 text-emerald-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveFlowchart}
                    className="col-span-2 gap-1.5 border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                  >
                    <Save className="size-3.5" /> Save as image (PNG)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyMermaid}
                    className="gap-1.5"
                  >
                    <Copy className="size-3.5" /> Mermaid
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveFlowchart}
                    className="gap-1.5"
                  >
                    <ImageIcon className="size-3.5" /> PNG
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Upload className="size-3.5" /> Replace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={reset}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" /> Reset
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-semibold tracking-tight">
              How it reads your document
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {[
                "Extracts every text line locally with pdf.js",
                "Detects headings, numbered sections & bullets",
                "Builds a hierarchy and renders Mermaid",
              ].map((t, i) => (
                <li key={t} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[10px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Right: canvas */}
        <section
          className={
            isFullscreen
              ? "hidden"
              : "glass relative flex min-h-[520px] flex-col overflow-hidden rounded-2xl shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] lg:min-h-0"
          }
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Flowchart canvas
            </span>
            {stage.kind === "done" ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={fitToWidth}
                  aria-label="Fit to width"
                  title="Fit to width"
                >
                  <Maximize2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={toggleFullscreen}
                  aria-label="Fullscreen"
                  title="Fullscreen"
                >
                  <Expand className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="canvas-scroll cursor-grab relative flex-1 overflow-auto grid-bg active:cursor-grabbing"
            onPointerDown={onPanPointerDown}
            onPointerMove={onPanPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onPointerLeave={endPan}
          >
            {stage.kind === "idle" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Workflow className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Your flowchart appears here</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Upload a PDF, Word doc or image on the left — reports, plans,
                  specs and photos of notes all work.
                </p>
              </div>
            ) : null}

            {busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <div className="relative size-14">
                  <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-full border border-primary/40 bg-primary/10">
                    <Loader2 className="size-6 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Forging nodes…</p>
              </div>
            ) : null}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: stage.kind === "done" ? 1 : 0 }}
              transition={{ duration: 0.35 }}
              className="flex min-h-full w-max min-w-full items-start justify-center p-8"
            >
              <div
                ref={svgHostRef}
                className="mermaid-canvas flex justify-center"
                style={{ transformOrigin: "top center" }}
              />
            </motion.div>
          </div>

          {/* Side-scroll controls (normal view) */}
          {stage.kind === "done" ? (
            <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full glass px-2.5 py-1.5 shadow-lg">
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto size-7 rounded-full"
                onClick={() => panHorizontally(-1)}
                aria-label="Scroll left"
                title="Scroll left"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Pan
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="pointer-events-auto size-7 rounded-full"
                onClick={() => panHorizontally(1)}
                aria-label="Scroll right"
                title="Scroll right"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </section>
      </main>

      {/* Fullscreen canvas overlay */}
      {isFullscreen && stage.kind === "done" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen flowchart view"
        >
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600">
                <Workflow className="size-4 text-white" strokeWidth={2.2} />
              </span>
              <span className="truncate text-sm font-medium">
                {stage.fileName.replace(/\.pdf$/i, "")} — flowchart
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                aria-label="Zoom out"
              >
                <ZoomOut className="size-4" />
              </Button>
              <span className="w-14 text-center text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
                aria-label="Zoom in"
              >
                <ZoomIn className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={fitToWidth}
                aria-label="Fit to width"
                title="Fit to width"
              >
                <Maximize2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={saveFlowchart}
                aria-label="Save flowchart"
                title="Save flowchart (SVG)"
              >
                <Save className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setIsFullscreen(false)}
                aria-label="Exit fullscreen"
                title="Exit fullscreen (Esc)"
              >
                <Minimize2 className="size-4" />
              </Button>
            </div>
          </div>

          <div
            ref={fsScrollRef}
            className="canvas-scroll cursor-grab relative flex-1 overflow-auto grid-bg active:cursor-grabbing"
            onPointerDown={onPanPointerDown}
            onPointerMove={onPanPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onPointerLeave={endPan}
          >
            <div className="flex min-h-full w-max min-w-full items-start justify-center p-10">
              <div
                className="mermaid-canvas flex justify-center"
                dangerouslySetInnerHTML={{
                  __html: svgHtmlRef.current ?? "",
                }}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                }}
              />
            </div>
          </div>

          {/* Side-scroll controls */}
          <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full glass px-3 py-2 shadow-lg">
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto size-8 rounded-full"
              onClick={() => panHorizontally(-1)}
              aria-label="Scroll left"
              title="Scroll left"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Pan
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="pointer-events-auto size-8 rounded-full"
              onClick={() => panHorizontally(1)}
              aria-label="Scroll right"
              title="Scroll right"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </motion.div>
      ) : null}

      <footer className="border-t border-white/5 py-6 text-center text-xs text-muted-foreground">
        FlowForge · 100% client-side · Built with pdf.js + Mermaid
      </footer>
    </div>
  );
}
