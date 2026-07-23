export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  progress: number;
  cancelable?: boolean;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskFunction = (taskId: string, reportProgress: (progress: number) => void, checkCancelled: () => boolean) => Promise<void>;

class TaskQueueService {
  private queue: { task: Task; execute: TaskFunction }[] = [];
  private history: Task[] = [];
  private isProcessing = false;
  private cancelledTasks: Set<string> = new Set();

  constructor() {}

  public enqueue(name: string, execute: TaskFunction, cancelable: boolean = true): string {
    const taskId = Math.random().toString(36).substring(2, 15);
    const task: Task = {
      id: taskId,
      name,
      status: 'pending',
      progress: 0,
      cancelable,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.queue.push({ task, execute });
    this.processNext();
    return taskId;
  }

  public cancelTask(taskId: string) {
    this.cancelledTasks.add(taskId);
    // If it's pending, we can just remove it or mark it cancelled immediately
    const pendingIndex = this.queue.findIndex(q => q.task.id === taskId && q.task.status === 'pending');
    if (pendingIndex !== -1) {
      this.queue[pendingIndex].task.status = 'cancelled';
      this.queue[pendingIndex].task.updatedAt = new Date();
      this.history.push(this.queue[pendingIndex].task);
      this.queue.splice(pendingIndex, 1);
    }
  }

  public getTasks(): Task[] {
    const activeTasks = this.queue.map(q => q.task);
    return [...activeTasks, ...this.history.slice(-10)]; // Return active + last 10 completed/failed
  }

  public getActiveTask(): Task | null {
    return this.queue.length > 0 && this.queue[0].task.status === 'running' ? this.queue[0].task : null;
  }

  public updateProgress(taskId: string, progress: number) {
    const qItem = this.queue.find(q => q.task.id === taskId);
    if (qItem) {
      qItem.task.progress = Math.min(100, Math.max(0, Math.round(progress)));
      qItem.task.updatedAt = new Date();
    }
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const current = this.queue[0];
    current.task.status = 'running';
    current.task.updatedAt = new Date();

    const reportProgress = (progress: number) => this.updateProgress(current.task.id, progress);
    const checkCancelled = () => this.cancelledTasks.has(current.task.id);

    try {
      await current.execute(current.task.id, reportProgress, checkCancelled);
      if (checkCancelled()) {
        current.task.status = 'cancelled';
      } else {
        current.task.status = 'completed';
        current.task.progress = 100;
      }
    } catch (error: any) {
      if (checkCancelled()) {
        current.task.status = 'cancelled';
      } else {
        current.task.status = 'failed';
        current.task.error = error.message || 'Unknown error occurred';
        console.error(`Task ${current.task.id} failed:`, error);
      }
    } finally {
      current.task.updatedAt = new Date();
      this.history.push(current.task);
      this.queue.shift(); // Remove from active queue
      this.cancelledTasks.delete(current.task.id); // Clean up
      this.isProcessing = false;
      this.processNext(); // Process next in queue
    }
  }
}

export const taskQueue = new TaskQueueService();
