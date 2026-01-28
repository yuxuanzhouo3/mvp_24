"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Terminal, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

interface LogEntry {
  id: number;
  type: "log" | "error" | "warn" | "info";
  content: string;
  timestamp: string;
}

export function WebLogConsole() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const logIdCounter = useRef(0);

  useEffect(() => {
    // 仅在 URL 包含 debug=true 时显示（不再因为小程序/套壳检测自动开启）
    const isDebug = new URLSearchParams(window.location.search).get("debug") === "true";
    if (isDebug) {
      setIsVisible(true);
    }
  }, []);

  const addLog = useCallback((type: LogEntry["type"], args: any[]) => {
    const content = args
      .map((arg) => {
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(" ");

    const newLog: LogEntry = {
      id: ++logIdCounter.current,
      type,
      content,
      timestamp: new Date().toLocaleTimeString(),
    };

    // 使用 setTimeout 避免 "Cannot update a component while rendering a different component" 警告
    setTimeout(() => {
      setLogs((prev) => [...prev.slice(-100), newLog]); // 最多保留100条
    }, 0);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = (...args) => {
      addLog("log", args);
      originalLog.apply(console, args);
    };
    console.error = (...args) => {
      addLog("error", args);
      originalError.apply(console, args);
    };
    console.warn = (...args) => {
      addLog("warn", args);
      originalWarn.apply(console, args);
    };
    console.info = (...args) => {
      addLog("info", args);
      originalInfo.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, [isVisible, addLog]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  if (!isVisible) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-[9999] bg-black/80 text-white p-3 rounded-full shadow-lg border border-white/20"
      >
        <Terminal size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-black text-white flex flex-col border-t border-white/20 transition-all duration-300"
         style={{ height: isMinimized ? "40px" : "40vh" }}>
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-green-500" />
          <span className="text-xs font-mono font-bold">H5 DEBUG CONSOLE</span>
          <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">
            {logs.length} logs
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLogs([])} className="text-zinc-400 hover:text-white">
            <Trash2 size={16} />
          </button>
          <button onClick={() => setIsMinimized(!isMinimized)} className="text-zinc-400 hover:text-white">
            {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-1 bg-black"
        >
          {logs.length === 0 && (
            <div className="text-zinc-600 italic p-4 text-center">No logs yet...</div>
          )}
          {logs.map((log) => (
            <div key={log.id} className="border-b border-white/5 pb-1">
              <div className="flex gap-2">
                <span className="text-zinc-500">[{log.timestamp}]</span>
                <span className={`font-bold ${
                  log.type === 'error' ? 'text-red-500' : 
                  log.type === 'warn' ? 'text-yellow-500' : 
                  log.type === 'info' ? 'text-blue-400' : 'text-green-400'
                }`}>
                  {log.type.toUpperCase()}:
                </span>
              </div>
              <pre className="whitespace-pre-wrap break-all mt-0.5 text-zinc-300">
                {log.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
