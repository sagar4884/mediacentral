import cron from 'node-cron';
import axios from 'axios';
import { prisma } from '../index';
import PushBox from 'pushover-notifications';
import { plexService } from './plexService';

export class TautulliMonitor {
  // Store currently active stream item IDs (TMDB/TVDB/RatingKey) to protect from deletion
  public activeStreams: Set<string> = new Set();
  
  // Track active sessions per user to detect concurrent IPs
  public userSessions: Record<string, any[]> = {};

  // Debounce lock to prevent Plex/Tautulli duplicate webhooks from firing double bans
  private lastViolationTime: Record<string, number> = {};
  
  constructor() {}

  async startCron() {
    // Check every hour to auto-unban expired bans
    cron.schedule('0 * * * *', async () => {
      console.log('Running Tautulli hourly auto-unban check...');
      await this.autoUnban();
    });
  }

  async autoUnban() {
    const expiredBans = await prisma.plexUser.findMany({
      where: { banUntil: { lt: new Date() } }
    });
    for (const bannedUser of expiredBans) {
      await prisma.plexUser.update({
        where: { id: bannedUser.id },
        data: {
          banUntil: null,
          warnings: 0,
          roleId: bannedUser.previousRoleId || bannedUser.roleId,
          previousRoleId: null
        }
      });
      console.log(`Auto-unbanned user: ${bannedUser.username}`);
      plexService.pushToPlex(bannedUser.id).catch(e => console.error(e));
    }
  }

  private async getSetting(key: string): Promise<string | null> {
    const setting = await prisma.setting.findUnique({ where: { key } });
    return setting?.value || null;
  }

  private async sendNotification(message: string, eventType: 'account_sharing' | 'plex_ban') {
    if (eventType === 'account_sharing') {
      const setting = await this.getSetting('PushoverNotifyAccountSharing');
      if (setting === 'false') return;
    } else if (eventType === 'plex_ban') {
      const setting = await this.getSetting('PushoverNotifyPlexBan');
      if (setting === 'false') return;
    }

    const userKey = await this.getSetting('PushoverUserKey');
    const token = await this.getSetting('PushoverAppToken');
    if (!userKey || !token) return;

    const push = new PushBox({ user: userKey, token: token });
    push.send({ title: 'MediaCentral Security', message }, (err: any) => {
      if (err) console.error("Pushover Error:", err);
    });
  }

  async handlePlaybackStart(session: any) {
    if (!session || !session.user || !session.ip_address) return;
    
    // Protect from deletion
    if (session.title) {
      this.activeStreams.add(session.title);
    }

    // Check for concurrent IPs
    const enableIP = await this.getSetting('EnableConcurrentIPProtection');
    if (enableIP !== 'false') {
      const username = session.user;
      const ip = session.ip_address;
      
      if (!this.userSessions[username]) {
        this.userSessions[username] = [];
      }
      
      const hasDifferentIp = this.userSessions[username].some(existing => existing.ip_address !== ip);
      
      if (hasDifferentIp) {
        await this.handleConcurrentIps(username, this.userSessions[username][0], session);
      } else {
        // Prevent duplicate session_ids from inflating the array
        const exists = this.userSessions[username].find(s => s.session_id === session.session_id);
        if (!exists) {
          this.userSessions[username].push(session);
        }
      }
    }
  }

  async handlePlaybackStop(session: any) {
    if (!session) return;
    
    if (session.title) {
      this.activeStreams.delete(session.title);
    }
    
    if (session.user) {
      const username = session.user;
      if (this.userSessions[username]) {
        this.userSessions[username] = this.userSessions[username].filter(s => s.session_id !== session.session_id);
        if (this.userSessions[username].length === 0) {
          delete this.userSessions[username];
        }
      }
    }
  }

  private async handleConcurrentIps(username: string, firstSession: any, currentSession: any) {
    const now = Date.now();
    // 10-second debounce lock to prevent duplicate webhook race conditions
    if (this.lastViolationTime[username] && now - this.lastViolationTime[username] < 10000) {
      console.log(`Duplicate violation blocked by debounce lock for user: ${username}`);
      return; 
    }
    this.lastViolationTime[username] = now;

    console.log(`Concurrent IPs detected for user: ${username}`);
    
    // Find or create user in DB
    const plexUserId = currentSession.user_id?.toString();
    let user;
    if (plexUserId) {
      user = await prisma.plexUser.findUnique({ where: { id: plexUserId } });
    }
    if (!user) {
      user = await prisma.plexUser.findFirst({ where: { username } });
    }
    if (!user) {
      user = await prisma.plexUser.create({
        data: { id: plexUserId || username, username, warnings: 0 }
      });
    }

    if (user.isImmune) {
      await prisma.plexViolation.create({
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
    } else if (newWarnings === 2) {
      durationSettingStr = await this.getSetting('BanDuration2') || '86400000'; // Default 1 day
    } else {
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
          await axios.get(`${url}/api/v2`, {
            params: { 
              apikey: apiKey, 
              cmd: 'terminate_session', 
              session_id: firstSession.session_id, 
              message: termMessage 
            }
          });
        } catch (e: any) {
          console.error('Failed to terminate stream:', e.message);
        }
      }
      actionTakenStr = 'First stream terminated';
      this.sendNotification(`Warning ${newWarnings}: Account sharing detected for ${username}. First stream terminated.`, 'account_sharing');
    } else {
      const days = banDuration / (24 * 60 * 60 * 1000);
      actionTakenStr = `Banned for ${days} days`;
      this.sendNotification(`Warning ${newWarnings}: ${username} banned for ${days} days due to account sharing.`, 'plex_ban');
    }

    await prisma.plexViolation.create({
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
    
    let updateData: any = { warnings: newWarnings, banUntil };

    let shouldPush = false;
    if (banUntil) {
      const banRoleName = await this.getSetting('BanRoleName') || 'Temporarily Banned';
      const revokedRoleName = await this.getSetting('RevokedRoleName') || 'Revoked';
      
      // Ensure "Temporarily Banned" role exists (fallback to Revoked)
      let bannedRole = await prisma.plexRole.findUnique({ where: { name: banRoleName } });
      if (!bannedRole) {
        bannedRole = await prisma.plexRole.findUnique({ where: { name: revokedRoleName } });
        if (!bannedRole) {
          bannedRole = await prisma.plexRole.create({ data: { name: revokedRoleName } });
        }
      }
      
      const newPreviousRoleId = user.roleId === bannedRole.id ? user.previousRoleId : user.roleId;
      
      updateData.previousRoleId = newPreviousRoleId;
      updateData.roleId = bannedRole.id;
      shouldPush = true;
    }
    
    await prisma.plexUser.update({
      where: { id: user.id },
      data: updateData
    });

    if (shouldPush) {
      plexService.pushToPlex(user.id).catch(e => console.error(e));
      // Task 3: Terminate all streams when banned
      this.terminateUserStreams(username, 'Account sharing detected. You have been banned.').catch(e => console.error(e));
    }
  }

  async terminateUserStreams(username: string, message: string = 'Stream terminated by administrator.') {
    const url = await this.getSetting('TautulliURL');
    const apiKey = await this.getSetting('TautulliKey');
    if (!url || !apiKey) return;

    try {
      // 1. Fetch current activity
      const activityRes = await axios.get(`${url}/api/v2`, {
        params: { apikey: apiKey, cmd: 'get_activity' }
      });
      const sessions = activityRes.data?.response?.data?.sessions || [];
      
      // 2. Filter sessions for the target user
      const userSessions = sessions.filter((s: any) => s.user.toLowerCase() === username.toLowerCase());
      
      // 3. Terminate each session
      for (const session of userSessions) {
        try {
          await axios.get(`${url}/api/v2`, {
            params: { 
              apikey: apiKey, 
              cmd: 'terminate_session', 
              session_id: session.session_id, 
              message 
            }
          });
          console.log(`Terminated stream for ${username} (Session ${session.session_id})`);
        } catch (e: any) {
          console.error(`Failed to terminate session ${session.session_id} for ${username}:`, e.message);
        }
      }
    } catch (e: any) {
      console.error(`Failed to fetch sessions to terminate for ${username}:`, e.message);
    }
  }
}

export const tautulliMonitor = new TautulliMonitor();
