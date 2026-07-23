import cron from 'node-cron';
import axios from 'axios';
import { prisma } from '../index';

export class SyncService {
  constructor() {}

  async startCron() {
    // Default to hourly if not set in DB
    const syncIntervalSetting = await prisma.setting.findUnique({ where: { key: 'SyncInterval' } });
    const cronExpression = syncIntervalSetting?.value || '0 * * * *'; 

    console.log(`Starting SyncService cron with expression: ${cronExpression}`);
    
    cron.schedule(cronExpression, async () => {
      console.log('Running scheduled media sync...');
      await this.syncRadarr();
      await this.syncSonarr();
    });
  }

  async manualSync() {
    console.log('Running manual media sync...');
    // In actual implementation, settings.ts should use taskQueue instead of this raw function
    await this.syncRadarr('manual-radarr', () => {});
    await this.syncSonarr('manual-sonarr', () => {});
  }

  private async getSetting(key: string): Promise<string | null> {
    const setting = await prisma.setting.findUnique({ where: { key } });
    return setting?.value || null;
  }

  async syncRadarr(taskId?: string, reportProgress?: (progress: number) => void, checkCancelled?: () => boolean) {
    try {
      if (reportProgress) reportProgress(0);
      const url = await this.getSetting('RadarrURL');
      const key = await this.getSetting('RadarrKey');

      if (!url || !key) {
        console.log('Radarr URL or Key not set. Skipping sync.');
        if (reportProgress) reportProgress(100);
        return;
      }

      const response = await axios.get(`${url}/api/v3/movie`, {
        headers: { 'X-Api-Key': key }
      });
      
      let tagMap = new Map();
      try {
        const tagsRes = await axios.get(`${url}/api/v3/tag`, { headers: { 'X-Api-Key': key } });
        for (const t of tagsRes.data) {
          tagMap.set(t.id, t.label);
        }
      } catch (e) {
        console.error("Failed to fetch Radarr tags", e);
      }

      const movies = response.data;
      if (reportProgress) reportProgress(5); // Fetch complete
      
      const total = movies.length;
      let count = 0;

      for (const movie of movies) {
        if (checkCancelled && checkCancelled()) break;
        // Tag detection logic
        const rawTags = movie.tags || [];
        const tags = rawTags.map((id: number) => tagMap.get(id) || String(id));
        
        const posterImage = movie.images?.find((img: any) => img.coverType === 'poster');
        const posterUrl = posterImage ? (posterImage.remoteUrl || posterImage.url) : null;
        
        await prisma.mediaCache.upsert({
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
      if (reportProgress) reportProgress(100);
      console.log(`Synced ${movies.length} movies from Radarr.`);
    } catch (error: any) {
      console.error(`Failed to sync Radarr: ${error.message}`);
      throw error;
    }
  }

  async syncSonarr(taskId?: string, reportProgress?: (progress: number) => void, checkCancelled?: () => boolean) {
    try {
      if (reportProgress) reportProgress(0);
      const url = await this.getSetting('SonarrURL');
      const key = await this.getSetting('SonarrKey');

      if (!url || !key) {
        console.log('Sonarr URL or Key not set. Skipping sync.');
        if (reportProgress) reportProgress(100);
        return;
      }

      const response = await axios.get(`${url}/api/v3/series`, {
        headers: { 'X-Api-Key': key }
      });
      
      let tagMap = new Map();
      try {
        const tagsRes = await axios.get(`${url}/api/v3/tag`, { headers: { 'X-Api-Key': key } });
        for (const t of tagsRes.data) {
          tagMap.set(t.id, t.label);
        }
      } catch (e) {
        console.error("Failed to fetch Sonarr tags", e);
      }

      const shows = response.data;
      if (reportProgress) reportProgress(5);
      
      const total = shows.length;
      let count = 0;
      
      for (const show of shows) {
        if (checkCancelled && checkCancelled()) break;
        const rawTags = show.tags || [];
        const tags = rawTags.map((id: number) => tagMap.get(id) || String(id));
        
        const posterImage = show.images?.find((img: any) => img.coverType === 'poster');
        const posterUrl = posterImage ? (posterImage.remoteUrl || posterImage.url) : null;
        
        await prisma.mediaCache.upsert({
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
      if (reportProgress) reportProgress(100);
      console.log(`Synced ${shows.length} shows from Sonarr.`);
    } catch (error: any) {
      console.error(`Failed to sync Sonarr: ${error.message}`);
      throw error;
    }
  }
}

export const syncService = new SyncService();
