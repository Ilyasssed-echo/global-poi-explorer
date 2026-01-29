import { Terminal, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';

interface LogsPanelProps {
  logs: string[];
  onClearLogs?: () => void;
}

export function LogsPanel({ logs, onClearLogs }: LogsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  if (logs.length === 0) return null;

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-slate-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Backend Logs</span>
          <span className="text-xs text-muted-foreground">({logs.length} lines)</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {onClearLogs && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearLogs}
            className="h-7 px-2 text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      
      {isExpanded && (
        <div 
          ref={scrollRef}
          className="max-h-[300px] overflow-y-auto px-4 py-3"
        >
          <div className="font-mono text-xs space-y-1">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`${
                  log.includes('✅') ? 'text-green-400' :
                  log.includes('❌') ? 'text-red-400' :
                  log.includes('⚠️') ? 'text-yellow-400' :
                  log.includes('🗺️') || log.includes('📥') || log.includes('🔍') || log.includes('📦') || log.includes('🦆') || log.includes('🧠') || log.includes('🌐') || log.includes('📊') ? 'text-primary' :
                  'text-muted-foreground'
                }`}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
