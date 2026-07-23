"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const index_1 = require("../index");
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// Get all settings
router.get('/', async (req, res) => {
    try {
        const settings = await index_1.prisma.setting.findMany();
        // Convert array of {key, value} to an object
        const settingsObj = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        res.json(settingsObj);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
// Update settings
router.post('/', async (req, res) => {
    try {
        const newSettings = req.body; // Expecting an object { key: value, ... }
        const updatePromises = Object.entries(newSettings).map(([key, value]) => {
            return index_1.prisma.setting.upsert({
                where: { key },
                update: { value: String(value) },
                create: { key, value: String(value) }
            });
        });
        await Promise.all(updatePromises);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
const syncService_1 = require("../services/syncService");
const tautulliMonitor_1 = require("../services/tautulliMonitor");
const taskQueue_1 = require("../services/taskQueue");
const pushover_notifications_1 = __importDefault(require("pushover-notifications"));
const sendSyncNotification = async (message) => {
    const notify = await index_1.prisma.setting.findUnique({ where: { key: 'PushoverNotifySyncCompletion' } });
    if (notify?.value === 'false')
        return;
    const userKey = await index_1.prisma.setting.findUnique({ where: { key: 'PushoverUserKey' } });
    const token = await index_1.prisma.setting.findUnique({ where: { key: 'PushoverAppToken' } });
    if (!userKey?.value || !token?.value)
        return;
    const push = new pushover_notifications_1.default({ user: userKey.value, token: token.value });
    push.send({ title: 'MediaCentral Sync', message }, (err) => {
        if (err)
            console.error("Pushover Error:", err);
    });
};
// Trigger manual sync
router.post('/sync', async (req, res) => {
    try {
        const { service } = req.body;
        let taskId = '';
        if (service) {
            const srv = service.toLowerCase();
            if (srv === 'radarr') {
                taskId = taskQueue_1.taskQueue.enqueue('Sync Radarr', (id, progress, checkCancelled) => syncService_1.syncService.syncRadarr(id, progress, checkCancelled), true);
            }
            else if (srv === 'sonarr') {
                taskId = taskQueue_1.taskQueue.enqueue('Sync Sonarr', (id, progress, checkCancelled) => syncService_1.syncService.syncSonarr(id, progress, checkCancelled), true);
            }
            else if (srv === 'tautulli') {
                taskId = taskQueue_1.taskQueue.enqueue('Sync Tautulli', async (id, progress, checkCancelled) => {
                    progress(0);
                    await tautulliMonitor_1.tautulliMonitor.checkStreams();
                    progress(100);
                });
            }
            else if (srv === 'plex') {
                taskId = taskQueue_1.taskQueue.enqueue('Sync Plex', async (id, progress, checkCancelled) => {
                    progress(0);
                    try {
                        const tokenSetting = await index_1.prisma.setting.findUnique({ where: { key: 'PlexToken' } });
                        const urlSetting = await index_1.prisma.setting.findUnique({ where: { key: 'PlexURL' } });
                        let fetchedCount = 0;
                        let totalSteps = 2;
                        if (tokenSetting?.value) {
                            // 1. Fetch Friends
                            try {
                                const res = await axios_1.default.get('https://plex.tv/api/v2/friends', {
                                    headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' },
                                    validateStatus: () => true
                                });
                                if (res.status === 200 && res.data) {
                                    const friends = res.data;
                                    for (const friend of friends) {
                                        if (checkCancelled())
                                            break;
                                        await index_1.prisma.plexUser.upsert({
                                            where: { id: String(friend.id) },
                                            update: { username: friend.username || friend.title || 'Unknown' },
                                            create: { id: String(friend.id), username: friend.username || friend.title || 'Unknown', warnings: 0 }
                                        });
                                    }
                                }
                            }
                            catch (e) {
                                console.error("Failed fetching friends", e);
                            }
                            progress(50);
                            // 2. Fetch Libraries from local server
                            if (urlSetting?.value) {
                                try {
                                    // Normalize URL
                                    const baseUrl = urlSetting.value.replace(/\/$/, '');
                                    const libRes = await axios_1.default.get(`${baseUrl}/library/sections`, {
                                        headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' },
                                        validateStatus: () => true
                                    });
                                    if (libRes.status === 200 && libRes.data?.MediaContainer?.Directory) {
                                        const libraries = libRes.data.MediaContainer.Directory;
                                        for (const lib of libraries) {
                                            if (checkCancelled())
                                                break;
                                            await index_1.prisma.plexLibrary.upsert({
                                                where: { id: String(lib.key) },
                                                update: { name: lib.title, type: lib.type },
                                                create: { id: String(lib.key), name: lib.title, type: lib.type }
                                            });
                                        }
                                    }
                                }
                                catch (e) {
                                    console.error("Failed fetching libraries", e);
                                }
                            }
                            // Fallback test users if DB is empty
                            const countUsers = await index_1.prisma.plexUser.count();
                            if (countUsers === 0) {
                                await index_1.prisma.plexUser.upsert({ where: { id: 'mock1' }, update: {}, create: { id: 'mock1', username: 'Uncle_Bob', warnings: 0 } });
                                await index_1.prisma.plexUser.upsert({ where: { id: 'mock2' }, update: {}, create: { id: 'mock2', username: 'College_Roommate', warnings: 2 } });
                                await index_1.prisma.plexUser.upsert({ where: { id: 'mock3' }, update: {}, create: { id: 'mock3', username: 'Cousin_Vinny', warnings: 3, banUntil: new Date(Date.now() + 86400000) } });
                                await index_1.prisma.plexLibrary.upsert({ where: { id: 'lib1' }, update: {}, create: { id: 'lib1', name: 'Movies', type: 'movie' } });
                                await index_1.prisma.plexLibrary.upsert({ where: { id: 'lib2' }, update: {}, create: { id: 'lib2', name: 'TV Shows', type: 'show' } });
                            }
                        }
                        else {
                            console.log("No Plex Token provided. Skipping sync.");
                        }
                    }
                    catch (e) {
                        console.error("Plex sync failed:", e);
                    }
                    progress(100);
                });
            }
            else if (srv === 'jellyseerr') {
                taskId = taskQueue_1.taskQueue.enqueue('Sync Jellyseerr', async (id, progress, checkCancelled) => {
                    progress(0);
                    // Placeholder for jellyseerr sync logic
                    await new Promise(r => setTimeout(r, 2000));
                    progress(100);
                });
            }
            res.json({ success: true, message: `Queued ${service} sync`, taskId });
        }
        else {
            // Global sync
            taskId = taskQueue_1.taskQueue.enqueue('Global Media Sync', async (id, progress, checkCancelled) => {
                progress(0);
                if (!checkCancelled())
                    await syncService_1.syncService.syncRadarr(id, (p) => progress(p * 0.4), checkCancelled);
                if (!checkCancelled())
                    await syncService_1.syncService.syncSonarr(id, (p) => progress(40 + p * 0.4), checkCancelled);
                if (!checkCancelled())
                    await tautulliMonitor_1.tautulliMonitor.checkStreams();
                progress(100);
                await sendSyncNotification('Global Media Sync completed successfully.');
            });
            res.json({ success: true, message: 'Global sync queued', taskId });
        }
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to trigger sync' });
    }
});
const axios_1 = __importDefault(require("axios"));
// Helper to verify connection based on service type
async function verifyConnection(service, url, key, config) {
    const needsUrl = !['tmdb', 'tvdb', 'gemini'].includes(service.toLowerCase());
    if (needsUrl && !url)
        return 'yellow'; // Missing config
    if (!key && service.toLowerCase() !== 'gemini')
        return 'yellow'; // Missing config
    try {
        let reqUrl = url;
        let headers = {};
        let params = {};
        // Normalize URL
        if (url.endsWith('/'))
            url = url.slice(0, -1);
        switch (service.toLowerCase()) {
            case 'radarr':
            case 'sonarr':
                reqUrl = `${url}/api/v3/system/status`;
                headers['X-Api-Key'] = key;
                break;
            case 'jellyseerr':
                reqUrl = `${url}/api/v1/status`;
                headers['X-Api-Key'] = key;
                break;
            case 'plex':
                reqUrl = `${url}/`;
                headers['X-Plex-Token'] = key;
                headers['Accept'] = 'application/json';
                break;
            case 'tautulli':
                reqUrl = `${url}/api/v2`;
                params = { apikey: key, cmd: 'status' };
                break;
            default:
                reqUrl = url;
        }
        // Special handling for TMDB
        if (service.toLowerCase() === 'tmdb') {
            try {
                const apiKey = key.trim();
                const isBearer = apiKey.length > 100;
                const tmdbHeaders = isBearer ? { Authorization: `Bearer ${apiKey}` } : {};
                const tmdbParams = isBearer ? {} : { api_key: apiKey };
                await axios_1.default.get('https://api.themoviedb.org/3/configuration', {
                    headers: tmdbHeaders,
                    params: tmdbParams,
                    timeout: 5000,
                    validateStatus: (status) => status === 200
                });
                return 'green';
            }
            catch (e) {
                fs_1.default.writeFileSync('api_test_error.log', `TMDB Test Error: ${e.message} ${JSON.stringify(e.response?.data)}\n`, { flag: 'a' });
                console.error('TMDB Test Error:', e.message, e.response?.data);
                return 'red';
            }
        }
        // Special handling for TVDB
        if (service.toLowerCase() === 'tvdb') {
            try {
                const loginRes = await axios_1.default.post('https://api4.thetvdb.com/v4/login', { apikey: key.trim() }, { timeout: 5000 });
                if (loginRes.data?.data?.token)
                    return 'green';
                return 'red';
            }
            catch (e) {
                fs_1.default.writeFileSync('api_test_error.log', `TVDB Test Error: ${e.message} ${JSON.stringify(e.response?.data)}\n`, { flag: 'a' });
                console.error('TVDB Test Error:', e.message, e.response?.data);
                return 'red';
            }
        }
        // Special handling for Unraid (GraphQL)
        if (service.toLowerCase() === 'unraid') {
            try {
                let uUrl = url;
                try {
                    uUrl = new URL(url).origin;
                }
                catch (e) { }
                const agent = new (require('https').Agent)({ rejectUnauthorized: false });
                const unraidRes = await axios_1.default.post(`${uUrl}/graphql`, {
                    query: `query { __typename }`
                }, {
                    headers: { 'x-api-key': key.trim() },
                    timeout: 5000,
                    httpsAgent: agent
                });
                if (unraidRes.data && !unraidRes.data.errors)
                    return 'green';
                return 'red';
            }
            catch (e) {
                console.error('Unraid Test Error:', e.message, e.response?.data);
                return 'red';
            }
        }
        // Special handling for Gemini
        if (service.toLowerCase() === 'gemini') {
            try {
                const modelToTest = (config && config.GeminiScoreModel) ? config.GeminiScoreModel : 'gemini-3.5-flash';
                await axios_1.default.get(`https://generativelanguage.googleapis.com/v1beta/models/${modelToTest}?key=${key.trim()}`, { timeout: 5000 });
                return 'green';
            }
            catch (e) {
                return 'red';
            }
        }
        // Special handling for Pushover
        if (service.toLowerCase() === 'pushover') {
            try {
                // Assume url is the PushoverUserKey and key is PushoverAppToken
                const params = new URLSearchParams();
                params.append('token', key.trim());
                params.append('user', url.trim());
                const pushRes = await axios_1.default.post('https://api.pushover.net/1/users/validate.json', params, { timeout: 5000 });
                if (pushRes.data?.status === 1)
                    return 'green';
                return 'red';
            }
            catch (e) {
                return 'red';
            }
        }
        await axios_1.default.get(reqUrl, {
            headers,
            params,
            timeout: 5000,
            validateStatus: (status) => status === 200
        });
        return 'green';
    }
    catch (e) {
        console.error(`verifyConnection error for ${service}:`, e.message, e.response?.data);
        return 'red';
    }
}
// Get status of all services
router.get('/status', async (req, res) => {
    try {
        const settings = await index_1.prisma.setting.findMany();
        const config = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        const status = {
            unraid: 'red',
            radarr: 'red',
            sonarr: 'red',
            jellyseerr: 'red',
            plex: 'red',
            tautulli: 'red',
            tmdb: 'red',
            tvdb: 'red',
            gemini: 'red',
            pushover: 'red'
        };
        status.unraid = await verifyConnection('unraid', config.UnraidURL, config.UnraidKey, config);
        status.radarr = await verifyConnection('radarr', config.RadarrURL, config.RadarrKey, config);
        status.sonarr = await verifyConnection('sonarr', config.SonarrURL, config.SonarrKey, config);
        status.jellyseerr = await verifyConnection('jellyseerr', config.JellyseerrURL, config.JellyseerrKey, config);
        status.plex = await verifyConnection('plex', config.PlexURL, config.PlexToken, config);
        status.tautulli = await verifyConnection('tautulli', config.TautulliURL, config.TautulliKey, config);
        if (config.TMDBKey)
            status.tmdb = await verifyConnection('tmdb', '', config.TMDBKey, config);
        if (config.TVDBKey)
            status.tvdb = await verifyConnection('tvdb', '', config.TVDBKey, config);
        if (config.GeminiKey)
            status.gemini = await verifyConnection('gemini', '', config.GeminiKey, config);
        if (config.PushoverAppToken && config.PushoverUserKey)
            status.pushover = await verifyConnection('pushover', config.PushoverUserKey, config.PushoverAppToken, config);
        res.json(status);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
});
// Test a specific service immediately
router.post('/test', async (req, res) => {
    try {
        const { service, url, key, scoreModel, learnModel } = req.body;
        if (service.toLowerCase() === 'gemini') {
            if (!key)
                return res.status(400).json({ success: false, message: 'Gemini API Key is required' });
            try {
                const modelsToTest = [scoreModel || 'gemini-3.5-flash', learnModel || 'gemini-3.1-pro-preview'];
                for (const model of modelsToTest) {
                    const reqUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${key}`;
                    await axios_1.default.get(reqUrl);
                }
                return res.json({ success: true, message: 'Successfully authenticated with Gemini API and verified models' });
            }
            catch (e) {
                if (e.response && e.response.data && e.response.data.error) {
                    const apiError = e.response.data.error;
                    if (apiError.status === 'NOT_FOUND' && apiError.message.includes('is no longer available')) {
                        return res.json({
                            success: false,
                            message: 'Selected model is not available.',
                            troubleshooting: `The selected Gemini model is no longer available to new users or does not exist.\n\n1. Go to the Google AI Configuration tab.\n2. Open the "Model for AI Scoring" and "Model for AI Learning" dropdowns.\n3. Change your selection to one of the recommended models (e.g., Gemini 3.1 Pro Preview and Gemini 3.5 Flash).\n4. Save Settings and Test again.`
                        });
                    }
                    if (apiError.status === 'PERMISSION_DENIED' && apiError.message.includes('has not been used in project')) {
                        return res.json({
                            success: false,
                            message: 'Gemini API is disabled.',
                            troubleshooting: `Gemini API (internally called the Generative Language API) is not turned on yet.\n\n1. Ensure you are in the correct project: Look at the top navigation bar and make sure your project is selected.\n2. Navigate to the API Library: Click the Navigation Menu (top left), hover over APIs & Services, and select Library.\n3. Search for the API: In the search bar, type 'Generative Language API' or 'Gemini API'.\n4. Enable the API: Click on the Generative Language API result, and then click the blue Enable button.\n\nWait a few minutes after enabling before testing again.`
                        });
                    }
                    if (apiError.status === 'PERMISSION_DENIED' && apiError.message.includes('are blocked')) {
                        return res.json({
                            success: false,
                            message: 'API Key is restricted.',
                            troubleshooting: `Your API Key is restricted and blocking the Generative Language API.\n\n1. Navigate to Credentials: In Google Cloud Console, click Navigation Menu > APIs & Services > Credentials.\n2. Edit your API Key: Under "API Keys", click your key name.\n3. Enable API Restrictions: Scroll down to API restrictions. Ensure 'Restrict key' is selected.\n4. Add Generative Language API: Click the Select APIs dropdown and check the box next to 'Generative Language API'.\n5. Save your changes.`
                        });
                    }
                    return res.json({ success: false, message: `Gemini API Error: ${apiError.message}` });
                }
                return res.json({ success: false, message: 'Failed to authenticate with Gemini API.' });
            }
        }
        if (!key && service.toLowerCase() !== 'gemini')
            return res.status(400).json({ success: false, message: 'API Key is required' });
        // Detailed test for Unraid
        if (service.toLowerCase() === 'unraid') {
            try {
                let uUrl = url;
                try {
                    uUrl = new URL(url).origin;
                }
                catch (e) { }
                const agent = new (require('https').Agent)({ rejectUnauthorized: false });
                const unraidRes = await axios_1.default.post(`${uUrl}/graphql`, {
                    query: `query { __typename }`
                }, {
                    headers: { 'x-api-key': key.trim() },
                    timeout: 5000,
                    httpsAgent: agent
                });
                if (unraidRes.data && unraidRes.data.errors) {
                    return res.json({ success: false, message: `Unraid API Error: ${JSON.stringify(unraidRes.data.errors)}` });
                }
                return res.json({ success: true, message: 'Successfully authenticated with Unraid' });
            }
            catch (e) {
                return res.json({ success: false, message: `Unraid API Error: ${e.response?.status || 'Network Error'} - ${e.message}` });
            }
        }
        // Detailed test for TMDB
        if (service.toLowerCase() === 'tmdb') {
            try {
                const apiKey = key.trim();
                const isBearer = apiKey.length > 100;
                const tmdbHeaders = isBearer ? { Authorization: `Bearer ${apiKey}` } : {};
                const tmdbParams = isBearer ? {} : { api_key: apiKey };
                await axios_1.default.get('https://api.themoviedb.org/3/configuration', { headers: tmdbHeaders, params: tmdbParams, timeout: 5000 });
                return res.json({ success: true, message: 'Successfully authenticated with TMDB' });
            }
            catch (e) {
                return res.json({ success: false, message: `TMDB API Error: ${e.response?.status} - ${JSON.stringify(e.response?.data) || e.message}` });
            }
        }
        // Detailed test for TVDB
        if (service.toLowerCase() === 'tvdb') {
            try {
                const loginRes = await axios_1.default.post('https://api4.thetvdb.com/v4/login', { apikey: key.trim() }, { timeout: 5000 });
                if (loginRes.data?.data?.token)
                    return res.json({ success: true, message: 'Successfully authenticated with TVDB' });
                return res.json({ success: false, message: 'TVDB API Error: Invalid response format' });
            }
            catch (e) {
                return res.json({ success: false, message: `TVDB API Error: ${e.response?.status} - ${JSON.stringify(e.response?.data) || e.message}` });
            }
        }
        // Detailed test for Pushover
        if (service.toLowerCase() === 'pushover') {
            try {
                const params = new URLSearchParams();
                params.append('token', key.trim());
                params.append('user', url.trim());
                params.append('message', 'MediaCentral: Test notification successful!');
                const pushRes = await axios_1.default.post('https://api.pushover.net/1/messages.json', params, { timeout: 5000 });
                if (pushRes.data?.status === 1)
                    return res.json({ success: true, message: 'Test notification sent via Pushover!' });
                return res.json({ success: false, message: 'Pushover API Error: Invalid status' });
            }
            catch (e) {
                return res.json({ success: false, message: `Pushover API Error: ${e.response?.status} - ${JSON.stringify(e.response?.data) || e.message}` });
            }
        }
        const result = await verifyConnection(service, url || '', key);
        if (result === 'green') {
            res.json({ success: true, message: `Successfully authenticated with ${service}` });
        }
        else {
            res.json({ success: false, message: `Failed to authenticate with ${service}. Check your URL and API Key.` });
        }
    }
    catch (error) {
        res.status(500).json({ success: false, message: 'Internal error during test' });
    }
});
exports.default = router;
