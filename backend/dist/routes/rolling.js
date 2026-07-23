"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const index_1 = require("../index");
const actionService_1 = require("../services/actionService");
const router = express_1.default.Router();
router.get('/', async (req, res) => {
    try {
        const shows = await index_1.prisma.rollingShow.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(shows);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/scan-ai', async (req, res) => {
    try {
        await actionService_1.actionService.scanForRollingShows();
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/update', async (req, res) => {
    try {
        const { id, status, keepEpisodes } = req.body;
        const show = await index_1.prisma.rollingShow.update({
            where: { id },
            data: { status, keepEpisodes }
        });
        res.json(show);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/dry-run', async (req, res) => {
    try {
        const results = await actionService_1.actionService.runRollingDryRun();
        res.json(results);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/execute', async (req, res) => {
    try {
        const { selections } = req.body; // Array of objects containing sonarrId and seasonNumber
        const results = await actionService_1.actionService.executeManualRolling(selections);
        res.json({ success: true, results });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
