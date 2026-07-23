import express from 'express';
import { prisma } from '../index';
import axios from 'axios';
import { plexService } from '../services/plexService';
import { tautulliMonitor } from '../services/tautulliMonitor';

const router = express.Router();
import PushBox from 'pushover-notifications';

const sendPlexNotification = async (message: string) => {
  const notify = await prisma.setting.findUnique({ where: { key: 'PushoverNotifyPlexBan' } });
  if (notify?.value === 'false') return;

  const userKey = await prisma.setting.findUnique({ where: { key: 'PushoverUserKey' } });
  const token = await prisma.setting.findUnique({ where: { key: 'PushoverAppToken' } });
  if (!userKey?.value || !token?.value) return;

  const push = new PushBox({ user: userKey.value, token: token.value });
  push.send({ title: 'MediaCentral Security', message }, (err: any) => {
    if (err) console.error("Pushover Error:", err);
  });
};

router.get('/users', async (req, res) => {
  try {
    const users = await prisma.plexUser.findMany({
      include: { role: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;
    
    const user = await prisma.plexUser.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const isBanned = user.banUntil && new Date(user.banUntil).getTime() > Date.now();
    
    if (isBanned) {
      // If user is currently serving a ban, update their previous role so they revert to it
      await prisma.plexUser.update({
        where: { id },
        data: { previousRoleId: roleId || null }
      });
    } else {
      // Otherwise, update their current role normally
      await prisma.plexUser.update({
        where: { id },
        data: { roleId: roleId || null }
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

router.get('/groups', async (req, res) => {
  try {
    const groups = await prisma.plexGroup.findMany({
      include: { libraries: true }
    });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.post('/groups', async (req, res) => {
  try {
    const { name, libraryIds } = req.body;
    const group = await prisma.plexGroup.create({
      data: {
        name,
        libraries: { connect: libraryIds.map((id: string) => ({ id })) }
      },
      include: { libraries: true }
    });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.plexGroup.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

router.get('/roles', async (req, res) => {
  try {
    const roles = await prisma.plexRole.findMany({
      include: { groups: true, users: true }
    });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

router.post('/roles', async (req, res) => {
  try {
    const { name, groupIds } = req.body;
    const role = await prisma.plexRole.create({
      data: {
        name,
        groups: { connect: groupIds.map((id: string) => ({ id })) }
      },
      include: { groups: true, users: true }
    });
    res.json(role);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.delete('/roles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.plexRole.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

router.get('/libraries', async (req, res) => {
  try {
    const libraries = await prisma.plexLibrary.findMany();
    res.json(libraries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch libraries' });
  }
});

router.post('/push', async (req, res) => {
  try {
    const result = await plexService.pushToPlex();
    res.json(result);
  } catch (error) {
    console.error("Push failed:", error);
    res.status(500).json({ error: 'Failed to push configuration to Plex' });
  }
});

router.post('/revoke/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { durationDays } = req.body || {};
    
    // Default to 7 days if not provided
    const days = durationDays ? parseInt(durationDays, 10) : 7;
    
    // Ensure "Temporarily Banned" role exists
    let bannedRole = await prisma.plexRole.findUnique({ where: { name: 'Temporarily Banned' } });
    if (!bannedRole) {
      bannedRole = await prisma.plexRole.create({ data: { name: 'Temporarily Banned' } });
    }

    const user = await prisma.plexUser.findUnique({ where: { id: username } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Only update previousRoleId if they aren't already in Temporarily Banned role
    const newPreviousRoleId = user.roleId === bannedRole.id ? user.previousRoleId : user.roleId;

    await prisma.plexUser.update({
      where: { id: username },
      data: { 
        banUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        previousRoleId: newPreviousRoleId,
        roleId: bannedRole.id
      }
    });
    // Update or create a violation record so it shows up in Security History
    const latestViolation = await prisma.plexViolation.findFirst({
      where: { userId: username },
      orderBy: { createdAt: 'desc' }
    });
    
    if (latestViolation) {
      await prisma.plexViolation.update({
        where: { id: latestViolation.id },
        data: { actionTaken: `Manually modified to ${days} days ban` }
      });
    } else {
      await prisma.plexViolation.create({
        data: {
          userId: user.id,
          ip1: 'N/A',
          title1: 'Manual Ban',
          ip2: 'N/A',
          title2: 'Manual Ban',
          actionTaken: `Manually banned for ${days} days`
        }
      });
    }

    // Terminate all streams immediately
    tautulliMonitor.terminateUserStreams(username, `Account access revoked for ${days} days by administrator.`).catch(e => console.error(e));
    
    // Push only this user to Plex to instantly enact the ban
    plexService.pushToPlex(username).catch(e => console.error(e));
    
    sendPlexNotification(`Access revoked for user: ${username}`);
    
    res.json({ success: true, message: `Access revoked for ${username}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke access' });
  }
});

router.post('/unban/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await prisma.plexUser.findUnique({ where: { id: username } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.plexUser.update({
      where: { id: username },
      data: { 
        banUntil: null, 
        warnings: 0,
        roleId: user.previousRoleId || user.roleId,
        previousRoleId: null
      }
    });

    // Instantly push role restoration to Plex
    plexService.pushToPlex(user.id).catch(e => console.error("Auto push failed on unban:", e));

    sendPlexNotification(`Access restored for user: ${username}`);

    res.json({ success: true, message: `Access restored for ${username}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

router.get('/activity', async (req, res) => {
  try {
    const urlSetting = await prisma.setting.findUnique({ where: { key: 'TautulliURL' } });
    const keySetting = await prisma.setting.findUnique({ where: { key: 'TautulliKey' } });
    
    if (!urlSetting?.value || !keySetting?.value) {
      return res.status(400).json({ error: 'Tautulli settings not configured' });
    }

    const response = await axios.get(`${urlSetting.value}/api/v2`, {
      params: { apikey: keySetting.value, cmd: 'get_activity' }
    });

    const data = response.data?.response?.data || {};
    
    const sessions = (data.sessions || []).map((s: any) => ({
      sessionId: s.session_id,
      username: s.user,
      title: s.title,
      grandparentTitle: s.grandparent_title,
      year: s.year,
      duration: s.duration,
      viewOffset: s.view_offset,
      progressPercent: s.progress_percent,
      player: s.player,
      product: s.product,
      device: s.device,
      platform: s.platform,
      state: s.state,
      ipAddress: s.ip_address,
      location: s.location,
      bandwidth: s.bandwidth,
      streamBitrate: s.stream_bitrate,
      container: s.container,
      transcodeContainer: s.transcode_container,
      videoCodec: s.video_codec,
      videoResolution: s.video_resolution,
      videoDecision: s.video_decision,
      audioCodec: s.audio_codec,
      audioDecision: s.audio_decision,
      audioChannels: s.audio_channel_layout,
      mediaType: s.media_type,
      season: s.parent_media_index,
      episode: s.media_index,
      thumb: s.grandparent_thumb || s.thumb
    }));

    res.json({
      streamCount: data.stream_count || 0,
      totalBandwidth: data.total_bandwidth || 0,
      sessions
    });
  } catch (error) {
    console.error("Failed to fetch activity:", error);
    res.status(500).json({ error: 'Failed to fetch activity from Tautulli' });
  }
});

router.post('/activity/terminate', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Session ID is required' });

    const urlSetting = await prisma.setting.findUnique({ where: { key: 'TautulliURL' } });
    const keySetting = await prisma.setting.findUnique({ where: { key: 'TautulliKey' } });
    
    if (!urlSetting?.value || !keySetting?.value) {
      return res.status(400).json({ error: 'Tautulli settings not configured' });
    }

    await axios.get(`${urlSetting.value}/api/v2`, {
      params: { 
        apikey: keySetting.value, 
        cmd: 'terminate_session', 
        session_id: sessionId, 
        message: message || 'Your stream has been terminated.'
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to terminate stream:", error);
    res.status(500).json({ error: 'Failed to terminate stream' });
  }
});

router.get('/image', async (req, res) => {
  try {
    const { thumb } = req.query;
    if (!thumb) return res.status(400).send('No thumb provided');

    const urlSetting = await prisma.setting.findUnique({ where: { key: 'TautulliURL' } });
    const keySetting = await prisma.setting.findUnique({ where: { key: 'TautulliKey' } });
    
    if (!urlSetting?.value || !keySetting?.value) {
      return res.status(400).send('Tautulli not configured');
    }

    const response = await axios.get(`${urlSetting.value}/api/v2`, {
      params: { 
        apikey: keySetting.value, 
        cmd: 'pms_image_proxy', 
        img: thumb,
        width: 300,
        height: 450,
        fallback: 'poster'
      },
      responseType: 'stream'
    });

    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Error proxying image');
  }
});

router.post('/users/:id/immune', async (req, res) => {
  try {
    const { id } = req.params;
    const { isImmune } = req.body;
    await prisma.plexUser.update({
      where: { id },
      data: { isImmune: !!isImmune }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update immunity' });
  }
});

router.get('/violations', async (req, res) => {
  try {
    const violations = await prisma.plexViolation.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(violations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch violations' });
  }
});

router.delete('/violations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.plexViolation.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete violation' });
  }
});

export default router;
