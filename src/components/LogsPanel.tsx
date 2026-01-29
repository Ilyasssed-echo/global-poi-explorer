import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface LogsPanelProps {
  logs: string[];
}

export function LogsPanel({ logs }: LogsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (logs.length === 0) return null;

  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Backend Logs</span>
          <span className="text-xs text-muted-foreground">({logs.length} lines)</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-4 max-h-80 overflow-y-auto">
          <div className="bg-background/50 rounded-md p-3 font-mono text-xs space-y-1">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`${
                  log.includes('✅') ? 'text-green-400' :
                  log.includes('❌') ? 'text-red-400' :
                  log.includes('⚠️') ? 'text-yellow-400' :
                  log.includes('🗺️') || log.includes('📥') || log.includes('🔍') ? 'text-primary' :
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
