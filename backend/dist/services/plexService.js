"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.plexService = exports.PlexService = void 0;
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const xml2js_1 = __importDefault(require("xml2js"));
class PlexService {
    async pushToPlex(specificUserId) {
        try {
            const whereClause = specificUserId ? { id: specificUserId } : {};
            const users = await index_1.prisma.plexUser.findMany({
                where: whereClause,
                include: {
                    role: {
                        include: {
                            groups: {
                                include: { libraries: true }
                            }
                        }
                    }
                }
            });
            const tokenSetting = await index_1.prisma.setting.findUnique({ where: { key: 'PlexToken' } });
            const urlSetting = await index_1.prisma.setting.findUnique({ where: { key: 'PlexURL' } });
            let machineIdentifier = '';
            if (tokenSetting?.value && urlSetting?.value) {
                try {
                    const baseUrl = urlSetting.value.replace(/\/$/, '');
                    const infoRes = await axios_1.default.get(`${baseUrl}/`, {
                        headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' },
                        validateStatus: () => true
                    });
                    if (infoRes.status === 200 && infoRes.data?.MediaContainer) {
                        machineIdentifier = infoRes.data.MediaContainer.machineIdentifier;
                    }
                }
                catch (e) {
                    console.error("Failed to get machine identifier");
                }
            }
            let plexUsersData = null;
            if (tokenSetting?.value) {
                try {
                    const usersRes = await axios_1.default.get('https://plex.tv/api/users', {
                        headers: { 'X-Plex-Token': tokenSetting.value }
                    });
                    const parser = new xml2js_1.default.Parser();
                    plexUsersData = await parser.parseStringPromise(usersRes.data);
                }
                catch (e) {
                    console.error("Failed to fetch plex.tv users XML");
                }
            }
            let serverSectionsMap = {};
            if (machineIdentifier && tokenSetting?.value) {
                try {
                    const res = await axios_1.default.get(`https://plex.tv/api/servers/${machineIdentifier}`, {
                        headers: { 'X-Plex-Token': tokenSetting.value }
                    });
                    const parser = new xml2js_1.default.Parser();
                    const data = await parser.parseStringPromise(res.data);
                    if (data && data.MediaContainer && data.MediaContainer.Server && data.MediaContainer.Server.length > 0) {
                        const sections = data.MediaContainer.Server[0].Section || [];
                        sections.forEach((s) => {
                            serverSectionsMap[s.$.key] = s.$.id;
                        });
                    }
                }
                catch (e) {
                    console.error("Failed to fetch server sections mapping");
                }
            }
            const revokedRoleSetting = await index_1.prisma.setting.findUnique({ where: { key: 'RevokedRoleName' } });
            const revokedRoleName = revokedRoleSetting?.value || 'Revoked';
            let revokedRole = await index_1.prisma.plexRole.findUnique({ where: { name: revokedRoleName }, include: { groups: { include: { libraries: true } } } });
            if (!revokedRole) {
                revokedRole = await index_1.prisma.plexRole.create({ data: { name: revokedRoleName }, include: { groups: { include: { libraries: true } } } });
            }
            const results = [];
            for (const user of users) {
                let activeRole = user.role;
                let wasUnassigned = false;
                if (!activeRole) {
                    await index_1.prisma.plexUser.update({
                        where: { id: user.id },
                        data: { roleId: revokedRole.id }
                    });
                    activeRole = revokedRole;
                    wasUnassigned = true;
                }
                const allowedLibraries = new Set();
                if (activeRole) {
                    for (const group of activeRole.groups) {
                        for (const lib of group.libraries) {
                            const mappedId = serverSectionsMap[lib.id];
                            if (mappedId) {
                                allowedLibraries.add(mappedId);
                            }
                        }
                    }
                }
                const libArray = Array.from(allowedLibraries);
                let shareId = null;
                if (plexUsersData && plexUsersData.MediaContainer && plexUsersData.MediaContainer.User) {
                    const xmlUser = plexUsersData.MediaContainer.User.find((u) => u.$.id === user.id);
                    if (xmlUser && xmlUser.Server) {
                        const targetServer = xmlUser.Server.find((s) => s.$.machineIdentifier === machineIdentifier);
                        if (targetServer) {
                            shareId = targetServer.$.id;
                        }
                    }
                }
                results.push({ username: user.username, action: wasUnassigned ? 'ASSIGNED REVOKED & UPDATED' : 'UPDATED', libraries: libArray });
                if (machineIdentifier && tokenSetting?.value) {
                    try {
                        if (shareId) {
                            await axios_1.default.put(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${shareId}`, {
                                server_id: machineIdentifier,
                                shared_server: { library_section_ids: libArray.map(Number) }
                            }, {
                                headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' }
                            });
                        }
                        else {
                            await axios_1.default.post(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
                                server_id: machineIdentifier,
                                shared_server: { library_section_ids: libArray.map(Number), invited_id: user.id }
                            }, {
                                headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' }
                            });
                        }
                    }
                    catch (e) {
                        console.error(`Failed to update ${user.username}`);
                    }
                }
            }
            return { success: true, results };
        }
        catch (error) {
            console.error("Push failed:", error);
            throw error;
        }
    }
}
exports.PlexService = PlexService;
exports.plexService = new PlexService();
