"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskQueue = void 0;
class TaskQueueService {
    queue = [];
    history = [];
    isProcessing = false;
    cancelledTasks = new Set();
    constructor() { }
    enqueue(name, execute, cancelable = true) {
        const taskId = Math.random().toString(36).substring(2, 15);
        const task = {
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
    cancelTask(taskId) {
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
    getTasks() {
        const activeTasks = this.queue.map(q => q.task);
        return [...activeTasks, ...this.history.slice(-10)]; // Return active + last 10 completed/failed
    }
    getActiveTask() {
        return this.queue.length > 0 && this.queue[0].task.status === 'running' ? this.queue[0].task : null;
    }
    updateProgress(taskId, progress) {
        const qItem = this.queue.find(q => q.task.id === taskId);
        if (qItem) {
            qItem.task.progress = Math.min(100, Math.max(0, Math.round(progress)));
            qItem.task.updatedAt = new Date();
        }
    }
    async processNext() {
        if (this.isProcessing || this.queue.length === 0)
            return;
        this.isProcessing = true;
        const current = this.queue[0];
        current.task.status = 'running';
        current.task.updatedAt = new Date();
        const reportProgress = (progress) => this.updateProgress(current.task.id, progress);
        const checkCancelled = () => this.cancelledTasks.has(current.task.id);
        try {
            await current.execute(current.task.id, reportProgress, checkCancelled);
            if (checkCancelled()) {
                current.task.status = 'cancelled';
            }
            else {
                current.task.status = 'completed';
                current.task.progress = 100;
            }
        }
        catch (error) {
            if (checkCancelled()) {
                current.task.status = 'cancelled';
            }
            else {
                current.task.status = 'failed';
                current.task.error = error.message || 'Unknown error occurred';
                console.error(`Task ${current.task.id} failed:`, error);
            }
        }
        finally {
            current.task.updatedAt = new Date();
            this.history.push(current.task);
            this.queue.shift(); // Remove from active queue
            this.cancelledTasks.delete(current.task.id); // Clean up
            this.isProcessing = false;
            this.processNext(); // Process next in queue
        }
    }
}
exports.taskQueue = new TaskQueueService();
