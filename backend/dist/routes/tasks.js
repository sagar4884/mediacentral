"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const taskQueue_1 = require("../services/taskQueue");
const router = (0, express_1.Router)();
// Get the current active task and the rest of the queue
router.get('/', (req, res) => {
    try {
        const active = taskQueue_1.taskQueue.getActiveTask();
        const all = taskQueue_1.taskQueue.getTasks();
        res.json({ active, queue: all });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});
router.post('/cancel', (req, res) => {
    try {
        const { id } = req.body;
        if (!id)
            return res.status(400).json({ error: 'Task ID is required' });
        taskQueue_1.taskQueue.cancelTask(id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to cancel task' });
    }
});
exports.default = router;
