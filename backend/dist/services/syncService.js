"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncService = exports.SyncService = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
class SyncService {
    constructor() { }
    async startCron() {
        // Default to hourly if not set in DB
        const syncIntervalSetting = await index_1.prisma.setting.findUnique({ where: { key: 'SyncInterval' } });
        const cronExpression = syncIntervalSetting?.value || '0 * * * *';
        console.log(`Starting SyncService cron with expression: ${cronExpression}`);
        node_cron_1.default.schedule(cronExpression, async () => {
            console.log('Running scheduled media sync...');
            await this.syncRadarr();
            await this.syncSonarr();
        });
    }
    async manualSync() {
        console.log('Running manual media sync...');
        // In actual implementation, settings.ts should use taskQueue instead of this raw function
        await this.syncRadarr('manual-radarr', () => { });
        await this.syncSonarr('manual-sonarr', () => { });
    }
    async getSetting(key) {
        const setting = await index_1.prisma.setting.findUnique({ where: { key } });
        return setting?.value || null;
    }
    async syncRadarr(taskId, reportProgress, checkCancelled) {
        try {
            if (reportProgress)
                reportProgress(0);
            const url = await this.getSetting('RadarrURL');
            const key = await this.getSetting('RadarrKey');
            if (!url || !key) {
                console.log('Radarr URL or Key not set. Skipping sync.');
                if (reportProgress)
                    reportProgress(100);
                return;
            }
            const response = await axios_1.default.get(`${url}/api/v3/movie`, {
                headers: { 'X-Api-Key': key }
            });
            let tagMap = new Map();
            try {
                const tagsRes = await axios_1.default.get(`${url}/api/v3/tag`, { headers: { 'X-Api-Key': key } });
                for (const t of tagsRes.data) {
                    tagMap.set(t.id, t.label);
                }
            }
            catch (e) {
                console.error("Failed to fetch Radarr tags", e);
            }
            const movies = response.data;
            if (reportProgress)
                reportProgress(5); // Fetch complete
            const total = movies.length;
            let count = 0;
            for (const movie of movies) {
                if (checkCancelled && checkCancelled())
                    break;
                // Tag detection logic
                const rawTags = movie.tags || [];
                const tags = rawTags.map((id) => tagMap.get(id) || String(id));
                const posterImage = movie.images?.find((img) => img.coverType === 'poster');
                const posterUrl = posterImage ? (posterImage.remoteUrl || posterImage.url) : null;
                await index_1.prisma.mediaCache.upsert({
                    where: {
                        source_sourceId: {
                            source: 'Radarr',
                            sourceId: movie.id
                        }
                    },
                    update: {
                        name: movie.title,
                        year: movie.year,
                        sizeOnDisk: movie.sizeOnDisk || 0,
                        tmdbId: movie.tmdbId,
                        path: movie.path,
                        tags: JSON.stringify(tags),
                        dateAdded: movie.added ? new Date(movie.added) : null,
                        metadata: JSON.stringify({ overview: movie.overview, status: movie.status, posterUrl })
                    },
                    create: {
                        source: 'Radarr',
                        sourceId: movie.id,
                        name: movie.title,
                        year: movie.year,
                        sizeOnDisk: movie.sizeOnDisk || 0,
                        tmdbId: movie.tmdbId,
                        path: movie.path,
                        tags: JSON.stringify(tags),
                        dateAdded: movie.added ? new Date(movie.added) : null,
                        metadata: JSON.stringify({ overview: movie.overview, status: movie.status, posterUrl }),
                        keepStatus: 'waiting' // Default new items to waiting
                    }
                });
                count++;
                if (reportProgress && total > 0) {
                    reportProgress(5 + (count / total) * 95);
                }
            }
            if (reportProgress)
                reportProgress(100);
            console.log(`Synced ${movies.length} movies from Radarr.`);
        }
        catch (error) {
            console.error(`Failed to sync Radarr: ${error.message}`);
            throw error;
        }
    }
    async syncSonarr(taskId, reportProgress, checkCancelled) {
        try {
            if (reportProgress)
                reportProgress(0);
            const url = await this.getSetting('SonarrURL');
            const key = await this.getSetting('SonarrKey');
            if (!url || !key) {
                console.log('Sonarr URL or Key not set. Skipping sync.');
                if (reportProgress)
                    reportProgress(100);
                return;
            }
            const response = await axios_1.default.get(`${url}/api/v3/series`, {
                headers: { 'X-Api-Key': key }
            });
            let tagMap = new Map();
            try {
                const tagsRes = await axios_1.default.get(`${url}/api/v3/tag`, { headers: { 'X-Api-Key': key } });
                for (const t of tagsRes.data) {
                    tagMap.set(t.id, t.label);
                }
            }
            catch (e) {
                console.error("Failed to fetch Sonarr tags", e);
            }
            const shows = response.data;
            if (reportProgress)
                reportProgress(5);
            const total = shows.length;
            let count = 0;
            for (const show of shows) {
                if (checkCancelled && checkCancelled())
                    break;
                const rawTags = show.tags || [];
                const tags = rawTags.map((id) => tagMap.get(id) || String(id));
                const posterImage = show.images?.find((img) => img.coverType === 'poster');
                const posterUrl = posterImage ? (posterImage.remoteUrl || posterImage.url) : null;
                await index_1.prisma.mediaCache.upsert({
                    where: {
                        source_sourceId: {
                            source: 'Sonarr',
                            sourceId: show.id
                        }
                    },
                    update: {
                        name: show.title,
                        year: show.year,
                        sizeOnDisk: show.statistics?.sizeOnDisk || 0,
                        tvdbId: show.tvdbId,
                        path: show.path,
                        tags: JSON.stringify(tags),
                        dateAdded: show.added ? new Date(show.added) : null,
                        metadata: JSON.stringify({ overview: show.overview, status: show.status, posterUrl })
                    },
                    create: {
                        source: 'Sonarr',
                        sourceId: show.id,
                        name: show.title,
                        year: show.year,
                        sizeOnDisk: show.statistics?.sizeOnDisk || 0,
                        tvdbId: show.tvdbId,
                        path: show.path,
                        tags: JSON.stringify(tags),
                        dateAdded: show.added ? new Date(show.added) : null,
                        metadata: JSON.stringify({ overview: show.overview, status: show.status, posterUrl }),
                        keepStatus: 'waiting'
                    }
                });
                count++;
                if (reportProgress && total > 0) {
                    reportProgress(5 + (count / total) * 95);
                }
            }
            if (reportProgress)
                reportProgress(100);
            console.log(`Synced ${shows.length} shows from Sonarr.`);
        }
        catch (error) {
            console.error(`Failed to sync Sonarr: ${error.message}`);
            throw error;
        }
    }
}
exports.SyncService = SyncService;
exports.syncService = new SyncService();
