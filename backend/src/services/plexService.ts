import axios from 'axios';
import { prisma } from '../index';
import xml2js from 'xml2js';

export class PlexService {
  async pushToPlex(specificUserId?: string) {
    try {
      const whereClause = specificUserId ? { id: specificUserId } : {};
      const users = await prisma.plexUser.findMany({
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

      const tokenSetting = await prisma.setting.findUnique({ where: { key: 'PlexToken' } });
      const urlSetting = await prisma.setting.findUnique({ where: { key: 'PlexURL' } });
      
      let machineIdentifier = '';
      if (tokenSetting?.value && urlSetting?.value) {
        try {
          const baseUrl = urlSetting.value.replace(/\/$/, '');
          const infoRes = await axios.get(`${baseUrl}/`, {
            headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' },
            validateStatus: () => true
          });
          if (infoRes.status === 200 && infoRes.data?.MediaContainer) {
            machineIdentifier = infoRes.data.MediaContainer.machineIdentifier;
          }
        } catch (e) {
          console.error("Failed to get machine identifier");
        }
      }
      
      let plexUsersData: any = null;
      if (tokenSetting?.value) {
        try {
          const usersRes = await axios.get('https://plex.tv/api/users', {
            headers: { 'X-Plex-Token': tokenSetting.value }
          });
          const parser = new xml2js.Parser();
          plexUsersData = await parser.parseStringPromise(usersRes.data);
        } catch (e) {
          console.error("Failed to fetch plex.tv users XML");
        }
      }

      let serverSectionsMap: any = {};
      if (machineIdentifier && tokenSetting?.value) {
        try {
          const res = await axios.get(`https://plex.tv/api/servers/${machineIdentifier}`, {
            headers: { 'X-Plex-Token': tokenSetting.value }
          });
          const parser = new xml2js.Parser();
          const data = await parser.parseStringPromise(res.data);
          if (data && data.MediaContainer && data.MediaContainer.Server && data.MediaContainer.Server.length > 0) {
            const sections = data.MediaContainer.Server[0].Section || [];
            sections.forEach((s: any) => {
              serverSectionsMap[s.$.key] = s.$.id;
            });
          }
        } catch (e) {
          console.error("Failed to fetch server sections mapping");
        }
      }

      const revokedRoleSetting = await prisma.setting.findUnique({ where: { key: 'RevokedRoleName' } });
      const revokedRoleName = revokedRoleSetting?.value || 'Revoked';

      let revokedRole = await prisma.plexRole.findUnique({ where: { name: revokedRoleName }, include: { groups: { include: { libraries: true } } } });
      if (!revokedRole) {
        revokedRole = await prisma.plexRole.create({ data: { name: revokedRoleName }, include: { groups: { include: { libraries: true } } } });
      }

      const results = [];
      
      for (const user of users) {
        let activeRole = user.role;
        let wasUnassigned = false;

        if (!activeRole) {
          await prisma.plexUser.update({
            where: { id: user.id },
            data: { roleId: revokedRole.id }
          });
          activeRole = revokedRole;
          wasUnassigned = true;
        }

        const allowedLibraries = new Set<string>();
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
          const xmlUser = plexUsersData.MediaContainer.User.find((u: any) => u.$.id === user.id);
          if (xmlUser && xmlUser.Server) {
            const targetServer = xmlUser.Server.find((s: any) => s.$.machineIdentifier === machineIdentifier);
            if (targetServer) {
              shareId = targetServer.$.id;
            }
          }
        }

        results.push({ username: user.username, action: wasUnassigned ? 'ASSIGNED REVOKED & UPDATED' : 'UPDATED', libraries: libArray });
        
        if (machineIdentifier && tokenSetting?.value) {
          try {
            if (shareId) {
              await axios.put(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers/${shareId}`, {
                server_id: machineIdentifier,
                shared_server: { library_section_ids: libArray.map(Number) }
              }, {
                headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' }
              });
            } else {
              await axios.post(`https://plex.tv/api/servers/${machineIdentifier}/shared_servers`, {
                server_id: machineIdentifier,
                shared_server: { library_section_ids: libArray.map(Number), invited_id: user.id }
              }, {
                headers: { 'X-Plex-Token': tokenSetting.value, 'Accept': 'application/json' }
              });
            }
          } catch (e: any) {
             console.error(`Failed to update ${user.username}`);
          }
        }
      }

      return { success: true, results };
    } catch (error) {
      console.error("Push failed:", error);
      throw error;
    }
  }
}

export const plexService = new PlexService();
