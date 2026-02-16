"use client";

import { useEffect, useRef, useState } from "react";

interface SmoothStreamTextProps {
  text: string;
  isStreaming: boolean;
  className?: string;
}

const MIN_CHARS_PER_SECOND = 36;
const MAX_CHARS_PER_SECOND = 220;
const MAX_CHARS_PER_FRAME = 14;

export function SmoothStreamText({
  text,
  isStreaming,
  className,
}: SmoothStreamTextProps) {
  const [visibleText, setVisibleText] = useState(text);
  const visibleTextRef = useRef(text);
  const targetTextRef = useRef(text);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const charBudgetRef = useRef(0);

  const setVisible = (next: string) => {
    visibleTextRef.current = next;
    setVisibleText(next);
  };

  const stopRaf = () => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastFrameAtRef.current = null;
    charBudgetRef.current = 0;
  };

  const startRafIfNeeded = () => {
    if (rafIdRef.current !== null) return;
    const tick = (now: number) => {
      const previous = lastFrameAtRef.current ?? now;
      const deltaMs = Math.min(64, Math.max(8, now - previous));
      lastFrameAtRef.current = now;

      const current = visibleTextRef.current;
      const target = targetTextRef.current;

      if (target.length < current.length || !target.startsWith(current)) {
        setVisible(target);
      } else if (current.length < target.length) {
        const backlog = target.length - current.length;
        const adaptiveSpeed = Math.min(
          MAX_CHARS_PER_SECOND,
          MIN_CHARS_PER_SECOND + backlog * 1.8
        );
        charBudgetRef.current += (deltaMs / 1000) * adaptiveSpeed;
        const nextChars = Math.min(
          backlog,
          MAX_CHARS_PER_FRAME,
          Math.floor(charBudgetRef.current)
        );
        if (nextChars > 0) {
          charBudgetRef.current -= nextChars;
          setVisible(target.slice(0, current.length + nextChars));
        }
      }

      const shouldContinue =
        visibleTextRef.current.length < targetTextRef.current.length;
      if (shouldContinue) {
        rafIdRef.current = window.requestAnimationFrame(tick);
      } else {
        rafIdRef.current = null;
        lastFrameAtRef.current = null;
      }
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
  };

  useEffect(() => {
    targetTextRef.current = text;
  }, [text]);

  useEffect(() => {
    if (text.length < visibleTextRef.current.length) {
      stopRaf();
      setVisible(text);
      return;
    }

    if (text.length === 0) {
      stopRaf();
      setVisible("");
      return;
    }

    if (!text.startsWith(visibleTextRef.current)) {
      stopRaf();
      setVisible(text);
      return;
    }

    if (!isStreaming) {
      stopRaf();
      setVisible(text);
      return;
    }

    if (visibleTextRef.current.length < text.length || rafIdRef.current === null) {
      startRafIfNeeded();
    }
  }, [isStreaming, text]);

  useEffect(() => {
    return () => {
      stopRaf();
    };
  }, []);

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
