"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChevronDown,
  ChevronUp,
  GitBranch,
  GripHorizontal,
  ListOrdered,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { TaskGraphSpec } from "@/types/task-graph";
import type { AIResponse, Message } from "./types";

interface RightNavDockProps {
  taskGraphMessages: Message[];
  multiAIHistoryMessages: Message[];
  showLiveResultNav: boolean;
  taskGraphNavDismissed: boolean;
  resultNavDismissed: boolean;
  taskGraphNavOpen: boolean;
  resultNavOpen: boolean;
  currentSessionId?: string;
  activeTaskGraphMessage: Message | null;
  activeTaskGraphNavSpec?: TaskGraphSpec;
  activeTaskGraphOrderedNodeIds: string[];
  activeResultMessage: Message | null;
  activeResultItems: AIResponse[];
  aiResponses: AIResponse[];
  language: string;
  getStatusColor: (status: string) => string;
  getConversationPreview: (message: Message) => string;
  getLiveResponseAnchorId: (response: AIResponse, index: number) => string;
  getMultiAIResponseAnchorId: (
    messageId: string,
    response: AIResponse,
    index: number
  ) => string;
  onJumpToMessage: (messageId: string) => void;
  setTaskGraphNavOpen: (open: boolean) => void;
  setTaskGraphNavDismissed: (dismissed: boolean) => void;
  setSelectedTaskGraphMessageId: (messageId: string | null) => void;
  restoreTaskGraphNav: () => void;
  setResultNavOpen: (open: boolean) => void;
  setResultNavDismissed: (dismissed: boolean) => void;
  setSelectedResultMessageId: (messageId: string | null) => void;
  restoreResultNav: () => void;
}

interface Point {
  x: number;
  y: number;
}

const BUBBLE_SIZE = 48;
const VIEWPORT_MARGIN = 12;
const DRAG_THRESHOLD = 4;
const POSITION_KEY = "gpt-right-nav-bubble-position:v1";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getRightDockX = (viewportWidth: number) =>
  Math.max(VIEWPORT_MARGIN, viewportWidth - BUBBLE_SIZE - VIEWPORT_MARGIN);

const clampBubbleY = (y: number, viewportHeight: number) => {
  const maxY = Math.max(VIEWPORT_MARGIN, viewportHeight - BUBBLE_SIZE - VIEWPORT_MARGIN);
  return clamp(y, VIEWPORT_MARGIN, maxY);
};

const clampBubblePosition = (pos: Point, viewportWidth: number, viewportHeight: number): Point => {
  return {
    x: getRightDockX(viewportWidth),
    y: clampBubbleY(pos.y, viewportHeight),
  };
};

const defaultBubblePosition = (viewportWidth: number, viewportHeight: number): Point =>
  clampBubblePosition(
    {
      x: getRightDockX(viewportWidth),
      y: Math.round(viewportHeight * 0.35),
    },
    viewportWidth,
    viewportHeight
  );

const cleanPreview = (value: string, maxLength: number = 36) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
};

const scrollToAnchor = (anchorId: string, fallbackMessageId?: string, onJumpToMessage?: (id: string) => void) => {
  const el = document.getElementById(anchorId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (fallbackMessageId && onJumpToMessage) {
    onJumpToMessage(fallbackMessageId);
  }
};

export function RightNavDock({
  taskGraphMessages,
  multiAIHistoryMessages,
  showLiveResultNav,
  taskGraphNavDismissed,
  resultNavDismissed,
  taskGraphNavOpen,
  resultNavOpen,
  currentSessionId,
  activeTaskGraphMessage,
  activeTaskGraphNavSpec,
  activeTaskGraphOrderedNodeIds,
  activeResultMessage,
  activeResultItems,
  aiResponses,
  language,
  getStatusColor,
  getConversationPreview,
  getLiveResponseAnchorId,
  getMultiAIResponseAnchorId,
  onJumpToMessage,
  setTaskGraphNavOpen,
  setTaskGraphNavDismissed,
  setSelectedTaskGraphMessageId,
  restoreTaskGraphNav,
  setResultNavOpen,
  setResultNavDismissed,
  setSelectedResultMessageId,
  restoreResultNav,
}: RightNavDockProps) {
  const [dockOpen, setDockOpen] = useState(true);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [bubblePos, setBubblePos] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const suppressClickRef = useRef(false);
  const dragStateRef = useRef({
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  });

  const hasTaskGraphContent = taskGraphMessages.length > 0;
  const hasResultHistory = multiAIHistoryMessages.length > 0;
  const hasResultContent = hasResultHistory || showLiveResultNav;

  const activeTaskGraphResponses = useMemo(() => {
    if (!activeTaskGraphMessage || !Array.isArray(activeTaskGraphMessage.content)) return [];
    return activeTaskGraphMessage.content as AIResponse[];
  }, [activeTaskGraphMessage]);

  const resultItems = showLiveResultNav ? aiResponses : activeResultItems;

  const showRestoreBar =
    (taskGraphNavDismissed && hasTaskGraphContent) || (resultNavDismissed && hasResultContent);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nextViewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    setViewport(nextViewport);

    let nextPosition = defaultBubblePosition(nextViewport.width, nextViewport.height);

    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Point>;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          nextPosition = clampBubblePosition(
            { x: parsed.x, y: parsed.y },
            nextViewport.width,
            nextViewport.height
          );
        }
      }
    } catch {
      // ignore invalid local storage payload
    }

    setBubblePos(nextPosition);
  }, []);

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;

    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(bubblePos));
    } catch {
      // ignore
    }
  }, [bubblePos, viewport.width, viewport.height]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport(nextViewport);
      setBubblePos((prev) =>
        clampBubblePosition(prev, nextViewport.width, nextViewport.height)
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isDragging || typeof window === "undefined") return;

    const onPointerMove = (event: PointerEvent) => {
      if (dragStateRef.current.pointerId !== event.pointerId) return;

      const nextPos = clampBubblePosition(
        {
          x: getRightDockX(window.innerWidth),
          y: event.clientY - dragStateRef.current.offsetY,
        },
        window.innerWidth,
        window.innerHeight
      );

      const dx = Math.abs(event.movementX);
      const dy = Math.abs(event.movementY);
      const dragDistanceX = Math.abs(event.clientX - dragStateRef.current.startClientX);
      const dragDistanceY = Math.abs(event.clientY - dragStateRef.current.startClientY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        dragStateRef.current.moved = true;
      }
      if (dragDistanceX > DRAG_THRESHOLD || dragDistanceY > DRAG_THRESHOLD) {
        dragStateRef.current.moved = true;
      }

      setBubblePos(nextPos);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragStateRef.current.pointerId !== event.pointerId) return;

      if (dragStateRef.current.moved) {
        suppressClickRef.current = true;
      }

      setIsDragging(false);
      dragStateRef.current.pointerId = -1;
      dragStateRef.current.startClientX = 0;
      dragStateRef.current.startClientY = 0;
      dragStateRef.current.offsetX = 0;
      dragStateRef.current.offsetY = 0;
      dragStateRef.current.moved = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!hasTaskGraphContent && !hasResultContent) {
      setDockOpen(false);
    }
  }, [hasTaskGraphContent, hasResultContent]);

  const panelStyle = useMemo(() => {
    if (!viewport.width || !viewport.height) return null;

    const panelWidth = clamp(320, 240, viewport.width - 24);
    const panelGap = 10;
    const minPanelHeight = 220;
    const maxPanelHeight = 500;

    const availableAbove = Math.max(0, bubblePos.y - VIEWPORT_MARGIN - panelGap);
    const availableBelow = Math.max(
      0,
      viewport.height - (bubblePos.y + BUBBLE_SIZE) - VIEWPORT_MARGIN - panelGap
    );
    const placeAbove =
      availableAbove >= minPanelHeight || availableAbove >= availableBelow;

    const boundedHeight = placeAbove ? availableAbove : availableBelow;
    const panelMaxHeight = clamp(
      Math.min(maxPanelHeight, boundedHeight),
      180,
      viewport.height - 24
    );

    const bubbleCenterX = bubblePos.x + BUBBLE_SIZE / 2;
    const left = clamp(
      Math.round(bubbleCenterX - panelWidth / 2),
      VIEWPORT_MARGIN,
      viewport.width - panelWidth - VIEWPORT_MARGIN
    );

    if (placeAbove) {
      return {
        left,
        width: panelWidth,
        maxHeight: panelMaxHeight,
        bottom: viewport.height - bubblePos.y + panelGap,
        placement: "above" as const,
      };
    }

    return {
      left,
      width: panelWidth,
      maxHeight: panelMaxHeight,
      top: bubblePos.y + BUBBLE_SIZE + panelGap,
      placement: "below" as const,
    };
  }, [bubblePos, viewport.height, viewport.width]);

  const handleBubblePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    dragStateRef.current.pointerId = event.pointerId;
    dragStateRef.current.startClientX = event.clientX;
    dragStateRef.current.startClientY = event.clientY;
    dragStateRef.current.offsetX = event.clientX - bubblePos.x;
    dragStateRef.current.offsetY = event.clientY - bubblePos.y;
    dragStateRef.current.moved = false;

    setIsDragging(true);
  };

  const handleBubbleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setDockOpen((prev) => !prev);
  };

  const dismissTaskGraphNav = () => {
    setTaskGraphNavDismissed(true);
    setTaskGraphNavOpen(false);
    if (currentSessionId) {
      try {
        localStorage.setItem(`task-graph-nav-dismissed:${currentSessionId}`, "1");
      } catch {
        // ignore
      }
    }
  };

  const dismissResultNav = () => {
    setResultNavDismissed(true);
    setResultNavOpen(false);
    if (currentSessionId) {
      try {
        localStorage.setItem(`multi-ai-nav-dismissed:${currentSessionId}`, "1");
      } catch {
        // ignore
      }
    }
  };

  const taskGraphHistory = [...taskGraphMessages].reverse();
  const resultHistory = [...multiAIHistoryMessages].reverse();

  return (
    <>
      <button
        type="button"
        aria-label={language === "zh" ? "打开定位导航" : "Open navigator"}
        onPointerDown={handleBubblePointerDown}
        onClick={handleBubbleClick}
        className={`fixed z-[65] h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${
          isDragging ? "cursor-grabbing scale-105" : "cursor-grab"
        }`}
        style={{
          left: bubblePos.x,
          top: bubblePos.y,
          touchAction: "none",
        }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center">
          <GripHorizontal className="h-3 w-3 opacity-80" />
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </button>

      {dockOpen && panelStyle && (
        <Card
          className="fixed z-[64] flex flex-col border-gray-200 bg-white/95 shadow-xl backdrop-blur-sm"
          style={{
            left: panelStyle.left,
            top: panelStyle.top,
            bottom: panelStyle.bottom,
            width: panelStyle.width,
            maxHeight: panelStyle.maxHeight,
          }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              <Sparkles className="h-4 w-4 text-blue-500" />
              {language === "zh" ? "结果定位" : "Result Navigator"}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setDockOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {!taskGraphNavDismissed && hasTaskGraphContent && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-gray-700"
                    onClick={() => setTaskGraphNavOpen(!taskGraphNavOpen)}
                  >
                    <GitBranch className="h-3.5 w-3.5 text-blue-500" />
                    {language === "zh" ? "任务图定位" : "Task Graph"}
                    <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                      {taskGraphMessages.length}
                    </Badge>
                    {taskGraphNavOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={dismissTaskGraphNav}
                    title={language === "zh" ? "关闭" : "Dismiss"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {taskGraphNavOpen && (
                  <div className="space-y-2 border-t px-2 py-2">
                    <div className="max-h-24 space-y-1 overflow-y-auto">
                      {taskGraphHistory.map((message) => {
                        const isActive = message.id === activeTaskGraphMessage?.id;
                        return (
                          <button
                            key={message.id}
                            type="button"
                            onClick={() => {
                              setSelectedTaskGraphMessageId(message.id);
                              onJumpToMessage(message.id);
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-colors ${
                              isActive
                                ? "bg-blue-50 text-blue-700"
                                : "text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            <span className="truncate">{cleanPreview(getConversationPreview(message))}</span>
                            <span className="ml-2 text-[10px] opacity-70">
                              {Array.isArray(message.content) ? message.content.length : 0}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {activeTaskGraphNavSpec && activeTaskGraphOrderedNodeIds.length > 0 && (
                      <div className="max-h-40 space-y-1 overflow-y-auto">
                        {activeTaskGraphOrderedNodeIds.map((nodeId) => {
                          const node = activeTaskGraphNavSpec.nodes.find((n) => n.id === nodeId);
                          const responseIndex = activeTaskGraphResponses.findIndex(
                            (item) => item.nodeId === nodeId
                          );
                          const response =
                            responseIndex >= 0 ? activeTaskGraphResponses[responseIndex] : undefined;
                          const status =
                            response?.status ??
                            ((response?.content || "").trim().length > 0
                              ? "completed"
                              : "pending");

                          return (
                            <button
                              key={nodeId}
                              type="button"
                              onClick={() => {
                                if (!activeTaskGraphMessage) return;
                                if (response && responseIndex >= 0) {
                                  const anchorId = getMultiAIResponseAnchorId(
                                    activeTaskGraphMessage.id,
                                    response,
                                    responseIndex
                                  );
                                  scrollToAnchor(anchorId, activeTaskGraphMessage.id, onJumpToMessage);
                                  return;
                                }
                                onJumpToMessage(activeTaskGraphMessage.id);
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50"
                            >
                              <span
                                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${getStatusColor(status)}`}
                              />
                              <span className="truncate">{node?.title || nodeId}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!resultNavDismissed && hasResultContent && (
              <div className="rounded-lg border border-gray-200">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-gray-700"
                    onClick={() => setResultNavOpen(!resultNavOpen)}
                  >
                    <ListOrdered className="h-3.5 w-3.5 text-blue-500" />
                    {language === "zh" ? "对话结果定位" : "Result Trace"}
                    <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px]">
                      {showLiveResultNav ? resultItems.length : multiAIHistoryMessages.length}
                    </Badge>
                    {showLiveResultNav && (
                      <Badge className="h-5 bg-blue-500 px-1.5 text-[10px] text-white">
                        LIVE
                      </Badge>
                    )}
                    {resultNavOpen ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={dismissResultNav}
                    title={language === "zh" ? "关闭" : "Dismiss"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {resultNavOpen && (
                  <div className="space-y-2 border-t px-2 py-2">
                    {resultHistory.length > 0 && (
                      <div className="max-h-24 space-y-1 overflow-y-auto">
                        {resultHistory.map((message) => {
                          const isActive = message.id === activeResultMessage?.id;
                          return (
                            <button
                              key={message.id}
                              type="button"
                              onClick={() => {
                                setSelectedResultMessageId(message.id);
                                onJumpToMessage(message.id);
                              }}
                              className={`w-full rounded-md px-2 py-1 text-left text-xs transition-colors ${
                                isActive
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <div className="truncate">{cleanPreview(getConversationPreview(message))}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {resultItems.map((response, index) => {
                        const status =
                          response.status ||
                          ((response.content || "").trim().length > 0
                            ? "completed"
                            : "pending");
                        const detail = cleanPreview(response.content || "", 42);

                        return (
                          <button
                            key={`${response.nodeId || response.agentId}-${index}`}
                            type="button"
                            onClick={() => {
                              const fallbackMessageId = activeResultMessage?.id;
                              if (showLiveResultNav) {
                                const anchorId = getLiveResponseAnchorId(response, index);
                                scrollToAnchor(anchorId, fallbackMessageId, onJumpToMessage);
                                return;
                              }

                              if (!activeResultMessage) return;
                              const anchorId = getMultiAIResponseAnchorId(
                                activeResultMessage.id,
                                response,
                                index
                              );
                              scrollToAnchor(anchorId, activeResultMessage.id, onJumpToMessage);
                            }}
                            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${getStatusColor(status)}`}
                              />
                              <span className="truncate font-medium">
                                {response.nodeTitle || response.agentName || `AI ${index + 1}`}
                              </span>
                            </div>
                            {detail && (
                              <div className="mt-0.5 truncate pl-4 text-[11px] text-gray-500">
                                {detail}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showRestoreBar && (
            <div className="flex items-center gap-2 border-t px-3 py-2">
              {taskGraphNavDismissed && hasTaskGraphContent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    restoreTaskGraphNav();
                    setTaskGraphNavOpen(true);
                  }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {language === "zh" ? "恢复任务图" : "Restore Graph"}
                </Button>
              )}
              {resultNavDismissed && hasResultContent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    restoreResultNav();
                    setResultNavOpen(true);
                  }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {language === "zh" ? "恢复结果" : "Restore Result"}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
