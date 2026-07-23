"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const https_1 = __importDefault(require("https"));
const router = (0, express_1.Router)();
// Cache agent for Unraid to avoid TLS issues on local networks
const httpsAgent = new https_1.default.Agent({ rejectUnauthorized: false });
router.get('/', async (req, res) => {
    try {
        const unraidUrl = await index_1.prisma.setting.findUnique({ where: { key: 'UnraidURL' } });
        const unraidKey = await index_1.prisma.setting.findUnique({ where: { key: 'UnraidKey' } });
        const tautulliUrl = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliURL' } });
        const tautulliKey = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliKey' } });
        const jellyseerrUrl = await index_1.prisma.setting.findUnique({ where: { key: 'JellyseerrURL' } });
        const jellyseerrKey = await index_1.prisma.setting.findUnique({ where: { key: 'JellyseerrKey' } });
        // Tautulli fetching
        let activeStreams = 0;
        let totalBandwidth = 0;
        if (tautulliUrl?.value && tautulliKey?.value) {
            try {
                const tRes = await axios_1.default.get(`${tautulliUrl.value}/api/v2`, {
                    params: { apikey: tautulliKey.value, cmd: 'get_activity' },
                    timeout: 3000
                });
                activeStreams = Number(tRes.data?.response?.data?.stream_count) || 0;
                totalBandwidth = Number(tRes.data?.response?.data?.total_bandwidth) || 0;
            }
            catch (e) {
                // Silently fail Tautulli if it goes offline
            }
        }
        // Jellyseerr fetching
        let jellyseerrPending = 0;
        if (jellyseerrUrl?.value && jellyseerrKey?.value) {
            try {
                const jRes = await axios_1.default.get(`${jellyseerrUrl.value}/api/v1/request/count`, {
                    headers: { 'X-Api-Key': jellyseerrKey.value },
                    timeout: 3000
                });
                jellyseerrPending = Number(jRes.data?.pending) || 0;
            }
            catch (e) {
                // Silently fail
            }
        }
        // Unraid hardware fetching
        let unraidStats = {
            cpuLoad: 0,
            cpuTemp: 0,
            ramTotal: 0,
            ramUsed: 0,
            gpuLoad: 0,
            gpuTemp: 0,
            gpuMemUsed: 0,
            gpuMemTotal: 0
        };
        if (unraidUrl?.value && unraidKey?.value) {
            try {
                let uUrl = unraidUrl.value;
                try {
                    uUrl = new URL(uUrl).origin;
                }
                catch (e) { }
                // Dynamix Temp and GPU Stats plugins extend the GraphQL schema.
                // We'll query them and gracefully handle if some fields are missing.
                const unraidRes = await axios_1.default.post(`${uUrl}/graphql`, {
                    query: `query {
            metrics { 
              cpu { percentTotal } 
              memory { total, free, used, active, percentTotal } 
              temperature { sensors { name, current { value } } } 
            }
          }`
                }, {
                    headers: { 'x-api-key': unraidKey.value.trim() },
                    timeout: 5000,
                    httpsAgent
                });
                const d = unraidRes.data?.data;
                if (d?.metrics) {
                    if (d.metrics.cpu?.percentTotal != null) {
                        unraidStats.cpuLoad = d.metrics.cpu.percentTotal;
                    }
                    if (d.metrics.memory) {
                        unraidStats.ramTotal = Number(d.metrics.memory.total) || 0;
                        // Unraid webGUI calculates used RAM excluding cache/buffers, which corresponds to 'active' or total-available.
                        unraidStats.ramUsed = Number(d.metrics.memory.active) || Number(d.metrics.memory.used) || 0;
                    }
                    if (d.metrics.temperature?.sensors) {
                        // Find a CPU and GPU temp if possible
                        const cpuSensor = d.metrics.temperature.sensors.find((s) => (s.name || '').toLowerCase().includes('cpu'));
                        if (cpuSensor)
                            unraidStats.cpuTemp = cpuSensor.current?.value || 0;
                        const gpuSensor = d.metrics.temperature.sensors.find((s) => {
                            const name = (s.name || '').toLowerCase();
                            return name.includes('gpu') || name.includes('nvidia') || name.includes('amd');
                        });
                        if (gpuSensor)
                            unraidStats.gpuTemp = gpuSensor.current?.value || 0;
                    }
                }
            }
            catch (e) {
                // Silently fail Unraid fetching
            }
        }
        res.json({
            success: true,
            jellyseerr: { pendingRequests: jellyseerrPending },
            tautulli: {
                activeStreams,
                totalBandwidth
            },
            unraid: unraidStats
        });
    }
    catch (error) {
        console.error("Failed to fetch realtime data:", error);
        res.status(500).json({ error: 'Failed to fetch realtime data' });
    }
});
exports.default = router;
