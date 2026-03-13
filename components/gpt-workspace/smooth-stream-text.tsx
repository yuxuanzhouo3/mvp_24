"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SmoothStreamTextProps {
  text: string;
  isStreaming: boolean;
  className?: string;
}

const MIN_GRAPHEMES_PER_SECOND = 30;
const MAX_GRAPHEMES_PER_SECOND = 120;
const BASE_MAX_GRAPHEMES_PER_FRAME = 6;

function splitGraphemes(text: string) {
  return Array.from(text || "");
}

function getMaxUnitsPerFrame(backlog: number) {
  if (backlog > 240) return 24;
  if (backlog > 120) return 16;
  if (backlog > 60) return 10;
  return BASE_MAX_GRAPHEMES_PER_FRAME;
}

export function SmoothStreamText({
  text,
  isStreaming,
  className,
}: SmoothStreamTextProps) {
  const [visibleText, setVisibleText] = useState(() => text);
  const visibleTextRef = useRef(text);
  const [initialUnits] = useState(() => splitGraphemes(text));
  const targetUnitsRef = useRef<string[]>(initialUnits);
  const targetTextRef = useRef(text);
  const visibleCountRef = useRef(initialUnits.length);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const unitBudgetRef = useRef(0);

  const setVisibleTextSync = useCallback((next: string) => {
    visibleTextRef.current = next;
    setVisibleText(next);
  }, []);

  const stopRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastFrameAtRef.current = null;
    unitBudgetRef.current = 0;
  }, []);

  const syncVisibleToTarget = useCallback(() => {
    visibleCountRef.current = targetUnitsRef.current.length;
    setVisibleTextSync(targetTextRef.current);
  }, [setVisibleTextSync]);

  const appendVisibleUnits = useCallback((count: number) => {
    if (count <= 0) return;
    const start = visibleCountRef.current;
    const end = Math.min(start + count, targetUnitsRef.current.length);
    if (end <= start) return;

    const chunk = targetUnitsRef.current.slice(start, end).join("");
    visibleCountRef.current = end;
    if (chunk.length) {
      visibleTextRef.current += chunk;
      setVisibleText(visibleTextRef.current);
    }
  }, []);

  const startRafIfNeeded = useCallback(() => {
    if (rafIdRef.current !== null) return;

    const tick = (now: number) => {
      const previous = lastFrameAtRef.current ?? now;
      const deltaMs = Math.min(80, Math.max(8, now - previous));
      lastFrameAtRef.current = now;

      const current = visibleCountRef.current;
      const target = targetUnitsRef.current.length;
      const backlog = Math.max(0, target - current);

      if (backlog > 0) {
        const adaptiveSpeed = Math.min(
          MAX_GRAPHEMES_PER_SECOND,
          MIN_GRAPHEMES_PER_SECOND + Math.sqrt(backlog) * 12
        );
        unitBudgetRef.current += (deltaMs / 1000) * adaptiveSpeed;

        const maxPerFrame = getMaxUnitsPerFrame(backlog);
        const nextUnits = Math.min(
          backlog,
          maxPerFrame,
          Math.max(1, Math.floor(unitBudgetRef.current))
        );
        if (nextUnits > 0) {
          unitBudgetRef.current -= nextUnits;
          appendVisibleUnits(nextUnits);
        }
      }

      if (visibleCountRef.current < targetUnitsRef.current.length) {
        rafIdRef.current = window.requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
        lastFrameAtRef.current = null;
      }
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
  }, [appendVisibleUnits]);

  useEffect(() => {
    if (text.length === 0) {
      stopRaf();
      targetUnitsRef.current = [];
      targetTextRef.current = "";
      visibleCountRef.current = 0;
      setVisibleTextSync("");
      return;
    }

    const prevText = targetTextRef.current;
    if (text !== prevText) {
      if (text.startsWith(prevText)) {
        const delta = text.slice(prevText.length);
        if (delta.length) {
          targetUnitsRef.current = targetUnitsRef.current.concat(
            splitGraphemes(delta)
          );
        }
      } else {
        targetUnitsRef.current = splitGraphemes(text);
        targetTextRef.current = text;
        stopRaf();
        visibleCountRef.current = targetUnitsRef.current.length;
        setVisibleTextSync(text);
        return;
      }
      targetTextRef.current = text;
    }

    if (!isStreaming) {
      stopRaf();
      syncVisibleToTarget();
      return;
    }

    if (visibleCountRef.current > targetUnitsRef.current.length) {
      visibleCountRef.current = targetUnitsRef.current.length;
      setVisibleTextSync(
        targetUnitsRef.current.slice(0, visibleCountRef.current).join("")
      );
      return;
    }

    if (visibleCountRef.current < targetUnitsRef.current.length) {
      startRafIfNeeded();
    }
  }, [
    isStreaming,
    setVisibleTextSync,
    startRafIfNeeded,
    stopRaf,
    syncVisibleToTarget,
    text,
  ]);

  useEffect(() => {
    return () => {
      stopRaf();
    };
  }, [stopRaf]);

  return (
    <>
      <p className={className}>
        {visibleText}
        <span className="stream-caret inline-block h-4 w-[2px] ml-1 align-[-2px] rounded-sm bg-blue-500" />
      </p>
      <style jsx>{`
        .stream-caret {
          animation: stream-caret 0.92s linear infinite;
          will-change: opacity, transform;
          box-shadow: 0 0 0.35rem rgba(59, 130, 246, 0.45);
        }

        @keyframes stream-caret {
          0% {
            opacity: 0.25;
            transform: scaleY(0.92);
          }
          50% {
            opacity: 1;
            transform: scaleY(1);
          }
          100% {
            opacity: 0.25;
            transform: scaleY(0.92);
          }
        }
      `}</style>
    </>
  );
}
