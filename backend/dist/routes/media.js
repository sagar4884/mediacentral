"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const axios_1 = __importDefault(require("axios"));
const actionService_1 = require("../services/actionService");
const router = (0, express_1.Router)();
// Get all media (for curation/dashboard)
router.get('/', async (req, res) => {
    try {
        const { status, source } = req.query; // e.g. ?status=waiting&source=Radarr
        const whereClause = {};
        if (status)
            whereClause.keepStatus = String(status);
        if (source)
            whereClause.source = String(source);
        const media = await index_1.prisma.mediaCache.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });
        const formattedMedia = media.map((m) => ({
            ...m,
            sizeOnDisk: Number(m.sizeOnDisk)
        }));
        res.json(formattedMedia);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch media' });
    }
});
// Get media statistics for the dashboard
router.get('/stats', async (req, res) => {
    try {
        const moviesCount = await index_1.prisma.mediaCache.count({ where: { source: 'Radarr' } });
        const showsCount = await index_1.prisma.mediaCache.count({ where: { source: 'Sonarr' } });
        const moviesResult = await index_1.prisma.mediaCache.aggregate({ _sum: { sizeOnDisk: true }, where: { source: 'Radarr' } });
        const showsResult = await index_1.prisma.mediaCache.aggregate({ _sum: { sizeOnDisk: true }, where: { source: 'Sonarr' } });
        const moviesBytes = Number(moviesResult._sum.sizeOnDisk || 0);
        const showsBytes = Number(showsResult._sum.sizeOnDisk || 0);
        const totalBytes = moviesBytes + showsBytes;
        const unraidUrl = await index_1.prisma.setting.findUnique({ where: { key: 'UnraidURL' } });
        const unraidKey = await index_1.prisma.setting.findUnique({ where: { key: 'UnraidKey' } });
        const radarrUrl = await index_1.prisma.setting.findUnique({ where: { key: 'RadarrURL' } });
        const radarrKey = await index_1.prisma.setting.findUnique({ where: { key: 'RadarrKey' } });
        const tautulliUrl = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliURL' } });
        const tautulliKey = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliKey' } });
        const storageProvider = await index_1.prisma.setting.findUnique({ where: { key: 'StorageProvider' } });
        const provider = storageProvider?.value || 'Unraid';
        let totalSpace = 0;
        let freeSpace = 0;
        let storageFetched = false;
        if (provider === 'Unraid' && unraidUrl?.value && unraidKey?.value) {
            try {
                let uUrl = unraidUrl.value;
                try {
                    uUrl = new URL(uUrl).origin;
                }
                catch (e) { }
                const agent = new (require('https').Agent)({ rejectUnauthorized: false });
                const unraidRes = await axios_1.default.post(`${uUrl}/graphql`, {
                    query: `query { array { capacity { kilobytes { total, free, used } } } }`
                }, {
                    headers: { 'x-api-key': unraidKey.value.trim() },
                    timeout: 5000,
                    httpsAgent: agent
                });
                if (unraidRes.data?.data?.array?.capacity?.kilobytes) {
                    totalSpace = (Number(unraidRes.data.data.array.capacity.kilobytes.total) || 0) * 1024;
                    freeSpace = (Number(unraidRes.data.data.array.capacity.kilobytes.free) || 0) * 1024;
                    if (totalSpace > 0)
                        storageFetched = true;
                }
            }
            catch (e) {
                console.error("Failed to fetch Unraid storage:", e);
            }
        }
        if (provider === 'Local OS') {
            try {
                const fs = require('fs');
                const root = process.platform === 'win32' ? 'C:\\\\' : '/';
                if (fs.statfsSync) {
                    const stat = fs.statfsSync(root);
                    totalSpace = stat.blocks * stat.bsize;
                    freeSpace = stat.bfree * stat.bsize;
                    if (totalSpace > 0)
                        storageFetched = true;
                }
            }
            catch (e) { }
        }
        if (!storageFetched && radarrUrl?.value && radarrKey?.value) {
            try {
                const dsRes = await axios_1.default.get(`${radarrUrl.value}/api/v3/diskspace`, { headers: { 'X-Api-Key': radarrKey.value } });
                if (dsRes.data && dsRes.data.length > 0) {
                    totalSpace = Number(dsRes.data[0].totalSpace) || 0;
                    freeSpace = Number(dsRes.data[0].freeSpace) || 0;
                }
            }
            catch (e) { }
        }
        let activeStreams = 0;
        let totalBandwidth = 0;
        if (tautulliUrl?.value && tautulliKey?.value) {
            try {
                const tRes = await axios_1.default.get(`${tautulliUrl.value}/api/v2`, {
                    params: { apikey: tautulliKey.value, cmd: 'get_activity' }
                });
                activeStreams = Number(tRes.data?.response?.data?.stream_count) || 0;
                totalBandwidth = Number(tRes.data?.response?.data?.total_bandwidth) || 0;
            }
            catch (e) { }
        }
        const recent = await index_1.prisma.mediaCache.findMany({
            take: 5,
            orderBy: { updatedAt: 'desc' }
        });
        const recentFormatted = recent.map((r) => ({
            ...r,
            sizeOnDisk: Number(r.sizeOnDisk)
        }));
        res.json({
            totalMovies: moviesCount,
            totalShows: showsCount,
            storageBytes: totalBytes,
            moviesBytes,
            showsBytes,
            totalSpace,
            freeSpace,
            activeStreams,
            totalBandwidth,
            recent: recentFormatted
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});
// Update media status (Keep/Delete manually)
router.post('/manual-curate', async (req, res) => {
    try {
        const urlSetting = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliURL' } });
        const keySetting = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliKey' } });
        const autoKeepWatched = await index_1.prisma.setting.findUnique({ where: { key: 'AutoKeepWatchedMedia' } });
        const autoKeepRequested = await index_1.prisma.setting.findUnique({ where: { key: 'AutoKeepRequestedMedia' } });
        const tautulliThresholdSetting = await index_1.prisma.setting.findUnique({ where: { key: 'TautulliShowWatchThreshold' } });
        const plexUrlSetting = await index_1.prisma.setting.findUnique({ where: { key: 'PlexURL' } });
        const plexTokenSetting = await index_1.prisma.setting.findUnique({ where: { key: 'PlexToken' } });
        const isAutoKeepWatched = autoKeepWatched?.value !== 'false';
        const isAutoKeepRequested = autoKeepRequested?.value !== 'false';
        const showThreshold = tautulliThresholdSetting?.value || 'any';
        const normalizeName = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
        let watchedCounts = new Map();
        let plexShowsWatched = new Map();
        if (isAutoKeepWatched) {
            if (urlSetting?.value && keySetting?.value) {
                try {
                    const url = urlSetting.value;
                    const apiKey = keySetting.value;
                    const libsRes = await axios_1.default.get(`${url}/api/v2`, {
                        params: { apikey: apiKey, cmd: 'get_libraries' }
                    });
                    const libraries = libsRes.data?.response?.data || [];
                    for (const lib of libraries) {
                        if (lib.section_type === 'movie' || lib.section_type === 'show') {
                            const mediaRes = await axios_1.default.get(`${url}/api/v2`, {
                                params: { apikey: apiKey, cmd: 'get_library_media_info', section_id: lib.section_id, length: 100000 }
                            });
                            const items = mediaRes.data?.response?.data?.data || [];
                            for (const item of items) {
                                if (item.title && item.play_count && parseInt(item.play_count) > 0) {
                                    watchedCounts.set(normalizeName(item.title), parseInt(item.play_count));
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    console.error('Tautulli manual curate fetch error:', e);
                }
            }
            if (plexUrlSetting?.value && plexTokenSetting?.value) {
                try {
                    const plexRes = await axios_1.default.get(`${plexUrlSetting.value}/library/sections`, {
                        headers: { 'X-Plex-Token': plexTokenSetting.value, 'Accept': 'application/json' }
                    });
                    const sections = plexRes.data?.MediaContainer?.Directory || [];
                    for (const section of sections) {
                        if (section.type === 'show') {
                            const sectionRes = await axios_1.default.get(`${plexUrlSetting.value}/library/sections/${section.key}/all`, {
                                headers: { 'X-Plex-Token': plexTokenSetting.value, 'Accept': 'application/json' }
                            });
                            const shows = sectionRes.data?.MediaContainer?.Metadata || [];
                            for (const show of shows) {
                                if (show.title) {
                                    plexShowsWatched.set(normalizeName(show.title), {
                                        viewed: parseInt(show.viewedLeafCount) || 0,
                                        total: parseInt(show.leafCount) || 0
                                    });
                                }
                            }
                        }
                    }
                }
                catch (e) {
                    console.error("Plex fetch error for shows:", e);
                }
            }
        }
        const waitingMedia = await index_1.prisma.mediaCache.findMany({
            where: { keepStatus: 'waiting' }
        });
        let updatedCount = 0;
        for (const media of waitingMedia) {
            let keepReason = '';
            if (isAutoKeepWatched) {
                let isWatched = false;
                const normName = normalizeName(media.name);
                if (media.source === 'Sonarr' && plexShowsWatched.has(normName)) {
                    const plexShowData = plexShowsWatched.get(normName);
                    if (plexShowData) {
                        const { viewed, total } = plexShowData;
                        if (showThreshold === 'full' && viewed >= total && total > 0)
                            isWatched = true;
                        else if (showThreshold === 'half' && (viewed / total) >= 0.5 && total > 0)
                            isWatched = true;
                        else if (showThreshold === 'any' && viewed > 0)
                            isWatched = true;
                        if (isWatched)
                            keepReason = `Watched ${viewed}/${total} episodes on Plex`;
                    }
                }
                // Fallback to Tautulli or if it's a Movie
                if (!isWatched) {
                    const playCount = watchedCounts.get(normName);
                    if (playCount && playCount > 0) {
                        isWatched = true;
                        keepReason = `Watched ${playCount} times on Tautulli`;
                    }
                }
            }
            if (!keepReason && isAutoKeepRequested) {
                // Check for Jellyseerr user tag
                try {
                    const tagsArray = JSON.parse(media.tags || "[]");
                    for (const tag of tagsArray) {
                        const match = tag.match(/^\d+-(.+)$/);
                        if (match) {
                            keepReason = `Requested by ${match[1]}`;
                            break;
                        }
                    }
                }
                catch (e) {
                    const match = media.tags?.match(/^\d+-(.+)$/);
                    if (match) {
                        keepReason = `Requested by ${match[1]}`;
                    }
                }
            }
            if (keepReason) {
                await index_1.prisma.mediaCache.update({
                    where: { id: media.id },
                    data: {
                        keepStatus: 'kept',
                        keepReason: keepReason
                    }
                });
                updatedCount++;
            }
        }
        res.json({ success: true, updatedCount });
    }
    catch (error) {
        console.error('Manual curate error:', error);
        res.status(500).json({ error: 'Failed to run manual curation' });
    }
});
// Update media status (Keep/Delete manually)
router.post('/:id/action', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, reason } = req.body; // action: 'keep' or 'delete'
        const media = await index_1.prisma.mediaCache.findUnique({ where: { id } });
        if (!media)
            return res.status(404).json({ error: 'Media not found' });
        // Update the media cache
        let newStatus = 'waiting';
        if (action === 'keep')
            newStatus = 'kept';
        if (action === 'delete')
            newStatus = 'marked_for_deletion';
        if (action === 'archive')
            newStatus = 'archive';
        if (action === 'wait')
            newStatus = 'waiting';
        const updateData = { keepStatus: newStatus, keepReason: reason };
        if (action === 'clear_score') {
            updateData.aiScore = null;
        }
        if (action === 'delete') {
            updateData.markedForDeletionAt = new Date();
        }
        else {
            updateData.markedForDeletionAt = null;
        }
        await index_1.prisma.mediaCache.update({
            where: { id },
            data: updateData
        });
        // Log the user action for AI training (only hard actions)
        if (action === 'keep' || action === 'delete' || action === 'archive') {
            await index_1.prisma.userAction.create({
                data: {
                    mediaId: String(media.tmdbId || media.tvdbId || media.sourceId),
                    mediaName: media.name,
                    action,
                    reason,
                    metadata: media.metadata
                }
            });
        }
        res.json({ success: true, newStatus });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update media action' });
    }
});
// Instant Delete (bypasses 30-day wait)
router.post('/:id/instant-delete', async (req, res) => {
    try {
        const { id } = req.params;
        await actionService_1.actionService.executeInstantDelete(id, true);
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to instantly delete media' });
    }
});
// Proxy image from Radarr/Sonarr
router.get('/image', async (req, res) => {
    try {
        const { url, source } = req.query;
        if (!url || typeof url !== 'string' || !source)
            return res.status(400).json({ error: 'Missing url or source' });
        let baseUrl = '';
        let apiKey = '';
        if (source === 'Radarr') {
            baseUrl = (await index_1.prisma.setting.findUnique({ where: { key: 'RadarrURL' } }))?.value || '';
            apiKey = (await index_1.prisma.setting.findUnique({ where: { key: 'RadarrKey' } }))?.value || '';
        }
        else if (source === 'Sonarr') {
            baseUrl = (await index_1.prisma.setting.findUnique({ where: { key: 'SonarrURL' } }))?.value || '';
            apiKey = (await index_1.prisma.setting.findUnique({ where: { key: 'SonarrKey' } }))?.value || '';
        }
        if (!baseUrl || !apiKey)
            return res.status(400).json({ error: 'Source config missing' });
        // Ensure we don't duplicate base URL if the url already has it (some remote URLs might)
        const targetUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        const response = await axios_1.default.get(targetUrl, {
            headers: { 'X-Api-Key': apiKey },
            responseType: 'stream'
        });
        res.set('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to proxy image' });
    }
});
// Get TMDB details (Cast, Synopsis, Poster) - For Radarr
router.get('/tmdb', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id)
            return res.status(400).json({ error: 'Missing id' });
        const keySetting = await index_1.prisma.setting.findUnique({ where: { key: 'TMDBKey' } });
        if (!keySetting?.value)
            return res.status(400).json({ error: 'TMDB Key not configured in Settings' });
        const isBearer = keySetting.value.length > 100;
        const headers = isBearer ? { Authorization: `Bearer ${keySetting.value}` } : {};
        const params = isBearer ? { append_to_response: 'credits' } : { api_key: keySetting.value, append_to_response: 'credits' };
        const response = await axios_1.default.get(`https://api.themoviedb.org/3/movie/${id}`, {
            headers,
            params
        });
        res.json({
            cast: (response.data?.credits?.cast || []).map((c) => ({
                id: c.id,
                name: c.name,
                character: c.character,
                profile_path: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : null
            }))
        });
    }
    catch (error) {
        console.error("TMDB fetch error:", error.message);
        res.status(500).json({ error: 'Failed to fetch TMDB data' });
    }
});
// Get TVDB details (Cast) - For Sonarr
router.get('/tvdb', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id)
            return res.status(400).json({ error: 'Missing id' });
        const keySetting = await index_1.prisma.setting.findUnique({ where: { key: 'TVDBKey' } });
        if (!keySetting?.value)
            return res.status(400).json({ error: 'TVDB Key not configured in Settings' });
        // 1. Login to get token
        const loginRes = await axios_1.default.post('https://api4.thetvdb.com/v4/login', { apikey: keySetting.value });
        const token = loginRes.data?.data?.token;
        if (!token)
            throw new Error("TVDB Login failed");
        // 2. Fetch extended series info (includes cast/characters)
        const seriesRes = await axios_1.default.get(`https://api4.thetvdb.com/v4/series/${id}/extended?meta=translations`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        // TVDB characters are stored under characters
        const characters = seriesRes.data?.data?.characters || [];
        // Map to TMDB-like structure for the frontend
        const cast = characters.map((c) => ({
            id: c.id,
            name: c.personName,
            character: c.name,
            profile_path: c.image || null
        }));
        res.json({ cast });
    }
    catch (error) {
        console.error("TVDB fetch error:", error.message);
        res.status(500).json({ error: 'Failed to fetch TVDB data' });
    }
});
// Bulk Tag Kept Items
router.post('/bulk-tag-kept', async (req, res) => {
    try {
        const { source } = req.body;
        if (!source || (source !== 'Radarr' && source !== 'Sonarr')) {
            return res.status(400).json({ error: 'Valid source (Radarr or Sonarr) is required' });
        }
        const items = await index_1.prisma.mediaCache.findMany({
            where: { keepStatus: 'kept', source: source }
        });
        if (items.length === 0) {
            return res.json({ success: true, count: 0, message: 'No kept items found' });
        }
        const urlSetting = await index_1.prisma.setting.findUnique({ where: { key: `${source}URL` } });
        const keySetting = await index_1.prisma.setting.findUnique({ where: { key: `${source}Key` } });
        if (!urlSetting?.value || !keySetting?.value) {
            return res.status(400).json({ error: `${source} config is missing` });
        }
        const baseUrl = urlSetting.value;
        const apiKey = keySetting.value;
        const headers = { 'X-Api-Key': apiKey };
        // 1. Get or Create tag 'ai-keep'
        let tagId = null;
        const tagsRes = await axios_1.default.get(`${baseUrl}/api/v3/tag`, { headers });
        const tags = tagsRes.data || [];
        const existingTag = tags.find((t) => t.label.toLowerCase() === 'ai-keep');
        if (existingTag) {
            tagId = existingTag.id;
        }
        else {
            const createRes = await axios_1.default.post(`${baseUrl}/api/v3/tag`, { label: 'ai-keep' }, { headers });
            tagId = createRes.data.id;
        }
        if (!tagId) {
            throw new Error("Failed to resolve tag ID");
        }
        // 2. Prepare bulk update
        const sourceIds = items.map(i => typeof i.sourceId === 'string' ? parseInt(i.sourceId) : i.sourceId).filter(id => !isNaN(id));
        if (sourceIds.length > 0) {
            if (source === 'Radarr') {
                await axios_1.default.put(`${baseUrl}/api/v3/movie/editor`, {
                    movieIds: sourceIds,
                    tags: [tagId],
                    applyTags: 'add'
                }, { headers });
            }
            else {
                await axios_1.default.put(`${baseUrl}/api/v3/series/editor`, {
                    seriesIds: sourceIds,
                    tags: [tagId],
                    applyTags: 'add'
                }, { headers });
            }
        }
        res.json({ success: true, count: sourceIds.length, message: `Successfully tagged ${sourceIds.length} items with ai-keep in ${source}` });
    }
    catch (error) {
        console.error(`Bulk tag error for ${req.body?.source}:`, error.message, error.response?.data);
        res.status(500).json({ error: 'Failed to bulk tag items' });
    }
});
exports.default = router;
