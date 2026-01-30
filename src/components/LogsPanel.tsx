import React, { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LogsPanelProps {
  logs: string[];
  onClearLogs?: () => void;
}

const LogsPanel = ({ logs, onClearLogs }: LogsPanelProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever a new log entry is added
  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs]);

  return (
    <Card className="flex flex-col h-full bg-slate-950 border-slate-800 shadow-xl overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">System Logs</h3>
        </div>
        {onClearLogs && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClearLogs}
            className="h-8 w-8 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* The container below uses 'flex-1' to fill available space 
          and 'overflow-y-auto' to enable mouse-wheel scrolling.
      */}
      <div
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 italic">
            <p>No activity recorded yet...</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log, index) => {
              // Simple logic to color-code logs based on content
              const isError = log.includes("❌") || log.includes("Error");
              const isSuccess = log.includes("✅") || log.includes("Success");
              const isStep = log.includes("STEP");

              return (
                <div
                  key={index}
                  className={`
                    py-1 px-2 rounded border-l-2 leading-relaxed break-words
                    ${
                      isError
                        ? "bg-rose-500/5 border-rose-500 text-rose-200"
                        : isSuccess
                          ? "bg-emerald-500/5 border-emerald-500 text-emerald-200"
                          : isStep
                            ? "bg-blue-500/5 border-blue-500 text-blue-200 font-bold mt-2"
                            : "bg-slate-900/30 border-slate-700 text-slate-300"
                    }
                  `}
                >
                  <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

export default LogsPanel;
