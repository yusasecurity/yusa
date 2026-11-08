// Adapted from evil-buttons ThreeDButton (Apache-2.0) — github.com/radiumcoders/evil-buttons
import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "../lib/cn.ts";

type Tone = "signal" | "bone" | "ink";

type Props = HTMLMotionProps<"button"> & {
  children?: React.ReactNode;
  tone?: Tone;
};

const press = { type: "spring", stiffness: 620, damping: 32, mass: 0.5 } as const;

const TONES: Record<Tone, { deck: string; face: string; spot: string; sheen: string }> = {
  signal: {
    deck: "bg-[#7a2400]",
    face: "bg-[#ff4d00] text-[#0c0c0b] shadow-[inset_0_0_0_1px_#ff6a2b,inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.18)]",
    spot: "bg-black/20",
    sheen: "via-white/60",
  },
  bone: {
    deck: "bg-[#0c0c0b]",
    face: "bg-[#f1ede4] text-[#0c0c0b] shadow-[inset_0_0_0_1px_#0c0c0b,inset_0_2px_0_rgba(255,255,255,0.9),inset_0_-2px_0_rgba(0,0,0,0.08)]",
    spot: "bg-black/10",
    sheen: "via-white",
  },
  ink: {
    deck: "bg-[#f1ede4]",
    face: "bg-[#161614] text-[#f1ede4] shadow-[inset_0_0_0_1px_#f1ede4,inset_0_2px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.4)]",
    spot: "bg-white/20",
    sheen: "via-white/20",
  },
};

export function ThreeDButton({ className, children = "Continue", tone = "signal", ...props }: Props) {
  const t = TONES[tone];
  return (
    <motion.button
      initial="rest"
      whileHover="hover"
      whileTap="tap"
      className={cn(
        "group relative isolate inline-flex min-w-38 cursor-pointer rounded-full pb-1.5 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[#ff4d00] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0b]",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      <motion.span
        aria-hidden
        variants={{ rest: { y: 0 }, hover: { y: 1 }, tap: { y: -1 } }}
        transition={press}
        className={cn("absolute inset-x-0 bottom-0 top-1.5 -z-10 rounded-full", t.deck)}
      />
      <motion.span
        // Whole-pixel moves only: fractional transforms make Chrome drop edge anti-aliasing.
        variants={{ rest: { y: 0 }, hover: { y: -2 }, tap: { y: 6 } }}
        transition={press}
        className={cn(
          "relative z-10 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-3",
          "font-mono text-[13px] font-semibold uppercase tracking-wider backface-hidden will-change-transform",
          t.face,
        )}
      >
        <motion.span
          aria-hidden
          variants={{ rest: { opacity: 0, scaleX: 0.25 }, hover: { opacity: 0.3, scaleX: 0.45 }, tap: { opacity: 1, scaleX: 1 } }}
          transition={press}
          className={cn("pointer-events-none absolute inset-y-1 left-1/2 w-10 -translate-x-1/2 rounded-full blur-sm", t.spot)}
        />
        <motion.span
          aria-hidden
          variants={{ rest: { opacity: 0, x: "-100%" }, hover: { opacity: 0.75, x: "-35%" }, tap: { opacity: 0.9, x: "82%" } }}
          transition={press}
          className={cn("pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-linear-to-r from-transparent to-transparent", t.sheen)}
        />
        <motion.span
          variants={{ rest: { y: 0 }, hover: { y: -1 }, tap: { y: 1 } }}
          transition={press}
          className="relative z-10 inline-flex items-center gap-2"
        >
          {children}
        </motion.span>
      </motion.span>
    </motion.button>
  );
}
