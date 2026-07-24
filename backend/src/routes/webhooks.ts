import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { syncService } from '../services/syncService';

const router = Router();

// Middleware to authenticate via API Key
const authenticateWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keySetting = await prisma.setting.findUnique({ where: { key: 'WebhookApiKey' } });
    const expectedKey = keySetting?.value;
    
    if (!expectedKey) {
      console.warn("Webhook received but WebhookApiKey is not set in MediaCentral.");
      return res.status(401).json({ error: 'API Key not configured in MediaCentral settings' });
    }

    // Check query param (?apikey=XYZ) or header (x-api-key)
    const providedKey = req.query.apikey || req.headers['x-api-key'];

    if (providedKey !== expectedKey) {
      return res.status(401).json({ error: 'Invalid API Key' });
    }

    next();
  } catch (error) {
    console.error("Error authenticating webhook", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Apply auth middleware to all routes in this router
router.use(authenticateWebhook);

// Helper to fetch and upsert a single Radarr movie
const syncRadarrMovie = async (movieId: number) => {
  const url = await prisma.setting.findUnique({ where: { key: 'RadarrURL' } });
  const key = await prisma.setting.findUnique({ where: { key: 'RadarrKey' } });
  if (!url?.value || !key?.value) return;

  const axios = require('axios');
  const response = await axios.get(`${url.value}/api/v3/movie/${movieId}`, {
    headers: { 'X-Api-Key': key.value }
  });
  const movie = response.data;
  
  let tags: string[] = [];
  try {
    const tagsRes = await axios.get(`${url.value}/api/v3/tag`, { headers: { 'X-Api-Key': key.value } });
    const tagMap = new Map(tagsRes.data.map((t: any) => [t.id, t.label]));
    tags = (movie.tags || []).map((id: number) => tagMap.get(id) || String(id));
  } catch (e) {}

  const posterImage = movie.images?.find((img: any) => img.coverType === 'poster');
  const posterUrl = posterImage ? (posterImage.remoteUrl || posterImage.url) : null;

  await prisma.mediaCache.upsert({
    where: { source_sourceId: { source: 'Radarr', sourceId: movie.id } },
    update: {
      name: movie.title, year: movie.year, sizeOnDisk: movie.sizeOnDisk || 0,
      tmdbId: movie.tmdbId, path: movie.path, tags: JSON.stringify(tags),
      dateAdded: movie.added ? new Date(movie.added) : null,
      metadata: JSON.stringify({ overview: movie.overview, status: movie.status, posterUrl })
    },
    create: {
      source: 'Radarr', sourceId: movie.id, name: movie.title, year: movie.year,
      sizeOnDisk: movie.sizeOnDisk || 0, tmdbId: movie.tmdbId, path: movie.path,
      tags: JSON.stringify(tags), dateAdded: movie.added ? new Date(movie.added) : null,
      metadata: JSON.stringify({ overview: movie.overview, status: movie.status, posterUrl }),
      keepStatus: 'waiting'
    }
  });
};

// 1. Radarr Webhook
router.post('/radarr', async (req, res) => {
  const payload = req.body;
  console.log(`[Webhook] Received Radarr Event: ${payload.eventType}`);
  
  try {
    // If we receive ANY Radarr webhook, we know the API is working. 
    // Downgrade the global sync schedule to daily (3 AM) to save resources.
    await syncService.setCronInterval('0 3 * * *');

    if (['Download', 'MovieAdded', 'Rename'].includes(payload.eventType)) {
      if (payload.movie?.id) {
        await syncRadarrMovie(payload.movie.id);
      }
    } else if (['MovieDeleted', 'MovieFileDeleted'].includes(payload.eventType)) {
      if (payload.movie?.id) {
        await prisma.mediaCache.deleteMany({
          where: { source: 'Radarr', sourceId: payload.movie.id }
        });
      }
    } else if (['Health', 'HealthRestored'].includes(payload.eventType)) {
      // Future: update Live Status globally
    }
  } catch (error) {
    console.error("[Webhook] Radarr logic failed:", error);
  }
  
  res.status(200).json({ success: true });
});

// Helper to fetch and upsert a single Sonarr series
const syncSonarrSeries = async (seriesId: number) => {
  const url = await prisma.setting.findUnique({ where: { key: 'SonarrURL' } });
  const key = await prisma.setting.findUnique({ where: { key: 'SonarrKey' } });
  if (!url?.value || !key?.value) return;

  const axios = require('axios');
  const response = await axios.get(`${url.value}/api/v3/series/${seriesId}`, {
    headers: { 'X-Api-Key': key.value }
  });
  const show = response.data;
  
  let tags: string[] = [];
  try {
    const tagsRes = await axios.get(`${url.value}/api/v3/tag`, { headers: { 'X-Api-Key': key.value } });
    const tagMap = new Map(tagsRes.data.map((t: any) => [t.id, t.label]));
    tags = (show.tags || []).map((id: number) => tagMap.get(id) || String(id));
  } catch (e) {}

  const posterImage = show.images?.find((img: any) => img.coverType === 'poster');
  const posterUrl = posterImage ? (posterImage.remoteUrl || posterImage.url) : null;

  await prisma.mediaCache.upsert({
    where: { source_sourceId: { source: 'Sonarr', sourceId: show.id } },
    update: {
      name: show.title, year: show.year, sizeOnDisk: show.statistics?.sizeOnDisk || 0,
      tvdbId: show.tvdbId, path: show.path, tags: JSON.stringify(tags),
      dateAdded: show.added ? new Date(show.added) : null,
      metadata: JSON.stringify({ overview: show.overview, status: show.status, posterUrl })
    },
    create: {
      source: 'Sonarr', sourceId: show.id, name: show.title, year: show.year,
      sizeOnDisk: show.statistics?.sizeOnDisk || 0, tvdbId: show.tvdbId, path: show.path,
      tags: JSON.stringify(tags), dateAdded: show.added ? new Date(show.added) : null,
      metadata: JSON.stringify({ overview: show.overview, status: show.status, posterUrl }),
      keepStatus: 'waiting'
    }
  });
};

// 2. Sonarr Webhook
router.post('/sonarr', async (req, res) => {
  const payload = req.body;
  console.log(`[Webhook] Received Sonarr Event: ${payload.eventType}`);
  
  try {
    // If we receive ANY Sonarr webhook, we know the API is working. 
    // Downgrade the global sync schedule to daily (3 AM) to save resources.
    await syncService.setCronInterval('0 3 * * *');

    if (['Download', 'SeriesAdd', 'Rename'].includes(payload.eventType)) {
      if (payload.series?.id) {
        await syncSonarrSeries(payload.series.id);
      }
    } else if (['SeriesDelete', 'SeriesDeleted'].includes(payload.eventType)) {
      if (payload.series?.id) {
        await prisma.mediaCache.deleteMany({
          where: { source: 'Sonarr', sourceId: payload.series.id }
        });
      }
    } else if (['Health', 'HealthRestored'].includes(payload.eventType)) {
      // Future: update Live Status globally
    }
  } catch (error) {
    console.error("[Webhook] Sonarr logic failed:", error);
  }

  res.status(200).json({ success: true });
});

// 3. Tautulli Webhook
router.post('/tautulli', async (req, res) => {
  const payload = req.body;
  const event = payload.event; // e.g. "playback_start", "playback_stop", etc.
  console.log(`[Webhook] Received Tautulli Event: ${event}`);
  
  try {
    switch(event) {
      case 'playback_start':
      case 'playback_stop':
      case 'playback_pause':
      case 'playback_resume':
      case 'playback_error':
      case 'watched':
        // Handle playback tracking (e.g., mark as rolling, update AI score, etc.)
        break;
      case 'transcode_decision_change':
      case 'watched_buffer_warning':
      case 'user_concurrent_streams':
        // e.g. Trigger IP Mismatch check to trigger Ban
        break;
      case 'intro_marker':
      case 'commercial_marker':
      case 'credits_marker':
      case 'recently_added':
      case 'user_new_device':
        // Metadata / user management
        break;
      case 'plex_server_down':
      case 'plex_server_up':
      case 'plex_remote_access_down':
      case 'plex_remote_access_up':
      case 'plex_update_available':
      case 'tautulli_update_available':
      case 'tautulli_database_corruption':
      case 'tautulli_plex_token_expired':
        // Handle server health events (Live Status update)
        break;
      default:
        console.log(`[Webhook] Unhandled Tautulli event: ${event}`);
    }
  } catch (error) {
    console.error("[Webhook] Tautulli logic failed:", error);
  }

  res.status(200).json({ success: true });
});

import multer from 'multer';
const upload = multer();

// 4. Plex Webhook
router.post('/plex', upload.any(), async (req, res) => {
  const payloadStr = req.body?.payload;
  if (!payloadStr) {
    return res.status(400).json({ error: 'Missing payload' });
  }
  
  try {
    const payload = JSON.parse(payloadStr);
    console.log(`[Webhook] Received Plex Event: ${payload.event}`);
    // TODO: Implement Plex logic
  } catch (e) {
    console.error("Failed to parse Plex payload", e);
  }
  
  res.status(200).json({ success: true });
});

// 5. Jellyseerr Webhook
router.post('/jellyseerr', async (req, res) => {
  const payload = req.body;
  console.log(`[Webhook] Received Jellyseerr Event: ${payload.notification_type}`);
  // TODO: Implement Jellyseerr logic
  res.status(200).json({ success: true });
});

export default router;
