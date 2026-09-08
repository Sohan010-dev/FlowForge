import { motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  Workflow,
  Github,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SocialLinks } from "@/components/SocialLinks";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.55, ease: "easeOut" as const },
};

const features = [
  {
    icon: Zap,
    title: "Instant structure",
    body: "Headings, numbered sections and bullet lists become nodes and edges the moment you drop a file.",
  },
  {
    icon: Lock,
    title: "Zero uploads",
    body: "Parsing happens in your browser with pdf.js. Your document never leaves the tab — there is no server to send it to.",
  },
  {
    icon: ShieldCheck,
    title: "No AI, no keys",
    body: "A transparent regex + heuristics engine does the work. Deterministic, auditable, and free forever.",
  },
  {
    icon: FileText,
    title: "Export anywhere",
    body: "Copy clean Mermaid syntax for your docs, or download the rendered diagram as a crisp SVG.",
  },
];

const steps = [
  { n: "01", t: "Drop a PDF", d: "Drag any text-based PDF into the forge." },
  { n: "02", t: "Local extraction", d: "pdf.js rebuilds lines and structure offline." },
  { n: "03", t: "Heuristic graph", d: "Sections nest into a hierarchical flowchart." },
  { n: "04", t: "Render & export", d: "Mermaid draws it; copy the syntax or SVG." },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 shadow-[0_0_16px_rgba(99,102,241,0.45)]">
              <Workflow className="size-4.5 text-white" strokeWidth={2.2} />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">
              Flow<span className="text-gradient-blue">Forge</span>
            </span>
          </a>
          <div className="flex items-center gap-4">
            <SocialLinks className="hidden sm:flex" />
            <Button
              asChild
              className="glow-ring rounded-lg bg-gradient-to-r from-indigo-500 to-blue-600 font-medium text-white transition-transform hover:scale-[1.02]"
            >
              <a href="/app">
                Launch app <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-24 pt-24 text-center sm:px-6 sm:pt-32">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground"
            >
              <Sparkles className="size-3.5 text-primary" />
              100% client-side · no AI APIs · no sign-up required
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="font-display mt-8 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl"
            >
              Turn any PDF into a{" "}
              <span className="text-gradient-blue glow-text">flowchart</span>{" "}
              in seconds.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
              className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              FlowForge reads your document's structure — headings, sections,
              lists — and forges it into a clean, navigable diagram. Entirely in
              your browser, entirely private.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
              className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
            >
              <Button
                asChild
                size="lg"
                className="glow-ring h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 px-7 text-base font-medium text-white transition-transform hover:scale-[1.03]"
              >
                <a href="/app">
                  Convert a PDF now <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="glass h-12 rounded-xl px-7 text-base"
              >
                <a href="#how">See how it works</a>
              </Button>
            </motion.div>

            {/* Decorative preview */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="glass glow-ring mt-16 w-full max-w-4xl rounded-2xl p-2"
            >
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-red-400/70" />
                <span className="size-2.5 rounded-full bg-yellow-400/70" />
                <span className="size-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-3 text-xs text-muted-foreground">
                  quarterly-roadmap.pdf → flowchart
                </span>
              </div>
              <div className="grid-bg rounded-xl bg-black/30 p-8">
                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                  {[
                    { w: "w-48", label: "Q3 Roadmap", shape: "rounded-full" },
                    { w: "w-64", label: "1. Ship real-time sync", shape: "rounded-xl" },
                    { w: "w-72", label: "Add offline-first cache", shape: "rounded-xl" },
                    { w: "w-56", label: "2. Grow integrations", shape: "rounded-full" },
                  ].map((row, i) => (
                    <div key={row.label} className="flex flex-col items-center">
                      {i > 0 ? (
                        <div className="h-4 w-px bg-gradient-to-b from-indigo-400/60 to-blue-400/60" />
                      ) : null}
                      <div
                        className={`${row.w} ${row.shape} border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-200 shadow-[0_0_18px_rgba(99,102,241,0.15)]`}
                      >
                        {row.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
          <motion.h2
            {...fadeUp}
            className="font-display text-center text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Built for clarity, not for servers
          </motion.h2>
          <motion.p
            {...fadeUp}
            className="mx-auto mt-4 max-w-lg text-center text-muted-foreground"
          >
            One constraint shapes everything: your documents stay yours.
          </motion.p>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="glass group rounded-2xl p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_40px_rgba(99,102,241,0.12)]"
              >
                <span className="flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary transition-shadow group-hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                  <f.icon className="size-5" />
                </span>
                <h3 className="font-display mt-4 text-lg font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-white/5 bg-black/20">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
            <motion.h2
              {...fadeUp}
              className="font-display text-center text-3xl font-bold tracking-tight sm:text-4xl"
            >
              Four steps, zero configuration
            </motion.h2>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <motion.div
                  key={s.n}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                  className="relative rounded-2xl border border-white/5 bg-white/[0.03] p-6"
                >
                  <span className="font-display text-3xl font-bold text-gradient-blue">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-semibold tracking-tight">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {s.d}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
          <motion.div
            {...fadeUp}
            className="glass glow-ring relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-16"
          >
            <div className="grid-bg pointer-events-none absolute inset-0" />
            <h2 className="font-display relative text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to see your document <span className="text-gradient-blue glow-text">take shape</span>?
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-muted-foreground">
              No account, no upload, no API key. Just drop a PDF and get a
              diagram.
            </p>
            <Button
              asChild
              size="lg"
              className="relative mt-8 h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 px-8 text-base font-medium text-white transition-transform hover:scale-[1.03]"
            >
              <a href="/app">
                Open FlowForge <ArrowRight className="size-4" />
              </a>
            </Button>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <p className="text-xs text-muted-foreground">
            FlowForge · pdf.js + Mermaid · everything runs client-side
          </p>
          <div className="flex items-center gap-3">
            <SocialLinks />
            <a
              href="https://github.com/Sohan010-dev"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
            >
              <Github className="size-3.5" /> Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
