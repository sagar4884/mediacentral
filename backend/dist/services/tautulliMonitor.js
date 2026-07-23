"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tautulliMonitor = exports.TautulliMonitor = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const pushover_notifications_1 = __importDefault(require("pushover-notifications"));
const plexService_1 = require("./plexService");
class TautulliMonitor {
    // Store currently active stream item IDs (TMDB/TVDB/RatingKey) to protect from deletion
    activeStreams = new Set();
    constructor() { }
    async startCron() {
        // Check every 2 minutes for active streams and concurrent IPs
        node_cron_1.default.schedule('*/2 * * * *', async () => {
            console.log('Running Tautulli monitor...');
            await this.checkStreams();
        });
    }
    async getSetting(key) {
        const setting = await index_1.prisma.setting.findUnique({ where: { key } });
        return setting?.value || null;
    }
    async sendNotification(message, eventType) {
        if (eventType === 'account_sharing') {
            const setting = await this.getSetting('PushoverNotifyAccountSharing');
            if (setting === 'false')
                return;
        }
        else if (eventType === 'plex_ban') {
            const setting = await this.getSetting('PushoverNotifyPlexBan');
            if (setting === 'false')
                return;
        }
        const userKey = await this.getSetting('PushoverUserKey');
        const token = await this.getSetting('PushoverAppToken');
        if (!userKey || !token)
            return;
        const push = new pushover_notifications_1.default({ user: userKey, token: token });
        push.send({ title: 'MediaCentral Security', message }, (err) => {
            if (err)
                console.error("Pushover Error:", err);
        });
    }
    async checkStreams() {
        try {
            const url = await this.getSetting('TautulliURL');
            const apiKey = await this.getSetting('TautulliKey');
            if (!url || !apiKey)
                return;
            const response = await axios_1.default.get(`${url}/api/v2`, {
                params: { apikey: apiKey, cmd: 'get_activity' }
            });
            const sessions = response.data?.response?.data?.sessions || [];
            // Auto-unban expired bans
            const expiredBans = await index_1.prisma.plexUser.findMany({
                where: { banUntil: { lt: new Date() } }
            });
            for (const bannedUser of expiredBans) {
                await index_1.prisma.plexUser.update({
                    where: { id: bannedUser.id },
                    data: {
                        banUntil: null,
                        warnings: 0,
                        roleId: bannedUser.previousRoleId || bannedUser.roleId,
                        previousRoleId: null
                    }
                });
                console.log(`Auto-unbanned user: ${bannedUser.username}`);
                plexService_1.plexService.pushToPlex(bannedUser.id).catch(e => console.error(e));
            }
            // Update active streams for deletion protection
            this.activeStreams.clear();
            sessions.forEach((s) => {
                // Tautulli provides guid or ratingKey we can map. 
                // For simplicity, store the ratingKey or title
                this.activeStreams.add(s.title);
            });
            // Check for concurrent IPs per user
            const enableIP = await this.getSetting('EnableConcurrentIPProtection');
            if (enableIP !== 'false') {
                const userSessions = {};
                for (const session of sessions) {
                    const username = session.user;
                    const ip = session.ip_address;
                    if (!userSessions[username]) {
                        userSessions[username] = [];
                    }
                    // If a user has multiple sessions with different IPs, flag them
                    const hasDifferentIp = userSessions[username].some(existing => existing.ip_address !== ip);
                    if (hasDifferentIp) {
                        await this.handleConcurrentIps(username, userSessions[username][0], session);
                    }
                    else {
                        userSessions[username].push(session);
                    }
                }
            }
        }
        catch (error) {
            console.error(`Failed to monitor Tautulli: ${error.message}`);
        }
    }
    async handleConcurrentIps(username, firstSession, currentSession) {
        console.log(`Concurrent IPs detected for user: ${username}`);
        // Find or create user in DB
        const plexUserId = currentSession.user_id?.toString();
        let user;
        if (plexUserId) {
            user = await index_1.prisma.plexUser.findUnique({ where: { id: plexUserId } });
        }
        if (!user) {
            user = await index_1.prisma.plexUser.findFirst({ where: { username } });
        }
        if (!user) {
            user = await index_1.prisma.plexUser.create({
                data: { id: plexUserId || username, username, warnings: 0 }
            });
        }
        if (user.isImmune) {
            await index_1.prisma.plexViolation.create({
                data: {
                    userId: user.id,
                    ip1: firstSession.ip_address,
                    title1: firstSession.title || firstSession.grandparent_title || 'Unknown',
                    ip2: currentSession.ip_address,
                    title2: currentSession.title || currentSession.grandparent_title || 'Unknown',
                    actionTaken: 'Immunity Triggered'
                }
            });
            return; // Do nothing else
        }
        // Increment warnings
        const newWarnings = user.warnings + 1;
        let banDuration = 0;
        let durationSettingStr = '0';
        if (newWarnings === 1) {
            durationSettingStr = await this.getSetting('BanDuration1') || '0';
        }
        else if (newWarnings === 2) {
            durationSettingStr = await this.getSetting('BanDuration2') || '86400000'; // Default 1 day
        }
        else {
            durationSettingStr = await this.getSetting('BanDuration3') || '604800000'; // Default 7 days
        }
        banDuration = parseInt(durationSettingStr, 10);
        let actionTakenStr = '';
        if (banDuration === 0) {
            // Disconnect first stream via Tautulli API
            const url = await this.getSetting('TautulliURL');
            const apiKey = await this.getSetting('TautulliKey');
            const termMessage = await this.getSetting('StreamTerminationMessage') || 'Account sharing detected. Stream terminated.';
            if (url && apiKey) {
                try {
                    await axios_1.default.get(`${url}/api/v2`, {
                        params: {
                            apikey: apiKey,
                            cmd: 'terminate_session',
                            session_id: firstSession.session_id,
                            message: termMessage
                        }
                    });
                }
                catch (e) {
                    console.error('Failed to terminate stream:', e.message);
                }
            }
            actionTakenStr = 'First stream terminated';
            this.sendNotification(`Warning ${newWarnings}: Account sharing detected for ${username}. First stream terminated.`, 'account_sharing');
        }
        else {
            const days = banDuration / (24 * 60 * 60 * 1000);
            actionTakenStr = `Banned for ${days} days`;
            this.sendNotification(`Warning ${newWarnings}: ${username} banned for ${days} days due to account sharing.`, 'plex_ban');
        }
        await index_1.prisma.plexViolation.create({
            data: {
                userId: user.id,
                ip1: firstSession.ip_address,
                title1: firstSession.title || firstSession.grandparent_title || 'Unknown',
                ip2: currentSession.ip_address,
                title2: currentSession.title || currentSession.grandparent_title || 'Unknown',
                actionTaken: actionTakenStr
            }
        });
        const banUntil = banDuration > 0 ? new Date(Date.now() + banDuration) : null;
        let updateData = { warnings: newWarnings, banUntil };
        let shouldPush = false;
        if (banUntil) {
            const banRoleName = await this.getSetting('BanRoleName') || 'Temporarily Banned';
            const revokedRoleName = await this.getSetting('RevokedRoleName') || 'Revoked';
            // Ensure "Temporarily Banned" role exists (fallback to Revoked)
            let bannedRole = await index_1.prisma.plexRole.findUnique({ where: { name: banRoleName } });
            if (!bannedRole) {
                bannedRole = await index_1.prisma.plexRole.findUnique({ where: { name: revokedRoleName } });
                if (!bannedRole) {
                    bannedRole = await index_1.prisma.plexRole.create({ data: { name: revokedRoleName } });
                }
            }
            const newPreviousRoleId = user.roleId === bannedRole.id ? user.previousRoleId : user.roleId;
            updateData.previousRoleId = newPreviousRoleId;
            updateData.roleId = bannedRole.id;
            shouldPush = true;
        }
        await index_1.prisma.plexUser.update({
            where: { id: user.id },
            data: updateData
        });
        if (shouldPush) {
            plexService_1.plexService.pushToPlex(user.id).catch(e => console.error(e));
            // Task 3: Terminate all streams when banned
            this.terminateUserStreams(username, 'Account sharing detected. You have been banned.').catch(e => console.error(e));
        }
    }
    async terminateUserStreams(username, message = 'Stream terminated by administrator.') {
        const url = await this.getSetting('TautulliURL');
        const apiKey = await this.getSetting('TautulliKey');
        if (!url || !apiKey)
            return;
        try {
            // 1. Fetch current activity
            const activityRes = await axios_1.default.get(`${url}/api/v2`, {
                params: { apikey: apiKey, cmd: 'get_activity' }
            });
            const sessions = activityRes.data?.response?.data?.sessions || [];
            // 2. Filter sessions for the target user
            const userSessions = sessions.filter((s) => s.user.toLowerCase() === username.toLowerCase());
            // 3. Terminate each session
            for (const session of userSessions) {
                try {
                    await axios_1.default.get(`${url}/api/v2`, {
                        params: {
                            apikey: apiKey,
                            cmd: 'terminate_session',
                            session_id: session.session_id,
                            message
                        }
                    });
                    console.log(`Terminated stream for ${username} (Session ${session.session_id})`);
                }
                catch (e) {
                    console.error(`Failed to terminate session ${session.session_id} for ${username}:`, e.message);
                }
            }
        }
        catch (e) {
            console.error(`Failed to fetch sessions to terminate for ${username}:`, e.message);
        }
    }
}
exports.TautulliMonitor = TautulliMonitor;
exports.tautulliMonitor = new TautulliMonitor();
