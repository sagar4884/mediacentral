"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  cancelable?: boolean;
  error?: string;
}

export function GlobalProgress() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    let lastCompletedId = '';
    
    const checkTasks = async () => {
      try {
        const res = await fetch('/api/tasks');
        const data = await res.json();
        
        if (data.active) {
          setActiveTask(data.active);
        } else {
          // If a task just finished, we can trigger a success toast if we want
          // We look at the history to see the most recent completed task
          const history = data.queue as Task[];
          if (history.length > 0) {
            const latest = history[history.length - 1];
            if (latest.status === 'completed' && latest.id !== lastCompletedId) {
              lastCompletedId = latest.id;
              toast.success(`${latest.name} completed successfully.`);
            } else if (latest.status === 'failed' && latest.id !== lastCompletedId) {
              lastCompletedId = latest.id;
              toast.error(`${latest.name} failed: ${latest.error}`);
            } else if (latest.status === 'cancelled' && latest.id !== lastCompletedId) {
              lastCompletedId = latest.id;
              toast.info(`${latest.name} was cancelled.`);
            }
          }
          setActiveTask(null);
        }
        
        const pending = (data.queue as Task[]).filter(t => t.status === 'pending');
        setQueueCount(pending.length);
      } catch (err) {
        // Silently ignore if backend is restarting/unavailable
      }
    };

    const interval = setInterval(checkTasks, 200);
    checkTasks();

    return () => clearInterval(interval);
  }, []);

  const handleCancel = async () => {
    if (!activeTask) return;
    try {
      await fetch('/api/tasks/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeTask.id })
      });
      toast.success("Cancelling task...");
    } catch (e) {
      toast.error("Failed to cancel task");
    }
  };

  if (!activeTask) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-5 fade-in duration-300">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl rounded-xl p-4 w-96 text-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-slate-200">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            {activeTask.name}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 font-mono">{activeTask.progress}%</span>
            {activeTask.cancelable && (
              <Button variant="ghost" size="icon" className="h-5 w-5 text-slate-400 hover:text-red-400 hover:bg-red-400/10" onClick={handleCancel} title="Cancel Task">
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
        
        <Progress value={activeTask.progress} className="h-2 w-full bg-slate-800" />
        
        {queueCount > 0 && (
          <div className="text-xs text-slate-500 text-right">
            + {queueCount} task{queueCount > 1 ? 's' : ''} in queue
          </div>
        )}
      </div>
    </div>
  );
}
