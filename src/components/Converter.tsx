import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FileText,
  Workflow,
  Loader2,
  Maximize2,
  RotateCcw,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import mermaid from "mermaid";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SocialLinks } from "@/components/SocialLinks";
import { extractPdfText } from "@/lib/pdf";
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
  | { kind: "parsing"; page: number; total: number }
  | { kind: "rendering" }
  | { kind: "done"; result: FlowchartResult; fileName: string };

let mermaidId = 0;

export default function Converter() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const naturalSizeRef = useRef<{ w: number; h: number } | null>(null);

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
    if (svgHostRef.current) svgHostRef.current.innerHTML = "";
  };

  /** Sizes the SVG element to natural dimensions × zoom so scrolling works. */
  const applyZoom = (z: number) => {
    const svg = svgRef.current;
    const nat = naturalSizeRef.current;
    if (!svg || !nat) return;
    svg.style.width = `${Math.round(nat.w * z)}px`;
    svg.style.height = `${Math.round(nat.h * z)}px`;
  };

  useEffect(() => {
    applyZoom(zoom);
  }, [zoom]);

  const fitToWidth = () => {
    const z = computeFitZoom(
      naturalSizeRef.current?.w ?? null,
      naturalSizeRef.current?.h ?? null,
      scrollRef.current,
    );
    setZoom(z);
    applyZoom(z);
  };

  const processFile = async (file: File) => {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setStage({
        kind: "error",
        message: `"${file.name}" is not a PDF. Please upload a .pdf file.`,
      });
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setStage({
        kind: "error",
        message: "That PDF is over 25 MB. Try a smaller file.",
      });
      toast.error("File too large (max 25 MB)");
      return;
    }

    try {
      setStage({ kind: "parsing", page: 0, total: 0 });
      const { pages } = await extractPdfText(file, (page, total) =>
        setStage({ kind: "parsing", page, total }),
      );

      setStage({ kind: "rendering" });
      // Yield a frame so the loading state paints before heavy work.
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const nodes = detectStructure(pages);
      const result = buildFlowchart(nodes);
      if (result.nodes.length === 0) {
        setStage({
          kind: "error",
          message:
            "No readable text found. This PDF may be scanned images or empty — FlowForge needs selectable text.",
        });
        return;
      }

      const renderId = `mmd-${++mermaidId}`;
      const { svg } = await mermaid.render(renderId, result.mermaid);
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
      setStage({ kind: "done", result, fileName: file.name });
      toast.success("Flowchart generated");
    } catch (err) {
      console.error(err);
      setStage({
        kind: "error",
        message:
          err instanceof Error && /password/i.test(err.message)
            ? "This PDF is password-protected."
            : "Something went wrong while reading that PDF. It may be corrupted or use an unsupported encoding.",
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

  const downloadSvg = () => {
    if (stage.kind !== "done" || !svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const blob = new Blob([clone.outerHTML], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = stage.fileName.replace(/\.pdf$/i, "") + "-flowchart.svg";
    a.click();
    URL.revokeObjectURL(url);
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
              PDF → Flowchart
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Drop a PDF and watch it become a diagram. Everything runs in your
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
                  accept="application/pdf,.pdf"
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
                  {dragActive ? "Drop it here" : "Drag & drop your PDF"}
                </span>
                <span className="text-xs text-muted-foreground">
                  or click to browse · max 25 MB
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
                      ? stage.total > 0
                        ? `Reading page ${stage.page} of ${stage.total}…`
                        : "Opening PDF…"
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
                      {stage.result.stats.bullets} list items
                    </p>
                  </div>
                  <Check className="ml-auto size-4 shrink-0 text-emerald-400" />
                </div>
                <div className="grid grid-cols-2 gap-2">
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
                    onClick={downloadSvg}
                    className="gap-1.5"
                  >
                    <Download className="size-3.5" /> SVG
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
        <section className="glass relative flex min-h-[520px] flex-col overflow-hidden rounded-2xl shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] lg:min-h-0">
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
              </div>
            ) : null}
          </div>

          <div
            ref={scrollRef}
            className="canvas-scroll relative flex-1 overflow-auto grid-bg"
          >
            {stage.kind === "idle" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <Workflow className="size-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Your flowchart appears here</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Upload a PDF on the left — reports, plans, specs and docs with
                  clear structure work best.
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
                className="mermaid-canvas flex w-full justify-center transition-transform duration-200"
                style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
              />
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-muted-foreground">
        FlowForge · 100% client-side · Built with pdf.js + Mermaid
      </footer>
    </div>
  );
}
