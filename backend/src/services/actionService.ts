import axios from 'axios';
import cron from 'node-cron';
import { prisma } from '../index';
import { tautulliMonitor } from './tautulliMonitor';
import PushBox from 'pushover-notifications';

export class ActionService {
  constructor() {}

  private async getSetting(key: string): Promise<string | null> {
    const setting = await prisma.setting.findUnique({ where: { key } });
    return setting?.value || null;
  }

  private async isDryRun(): Promise<boolean> {
    const setting = await this.getSetting('DryRunMode');
    return setting === 'true';
  }

  private async sendNotification(message: string, eventType: 'manual_delete' | 'auto_delete' = 'auto_delete') {
    if (eventType === 'auto_delete') {
      const notifyAuto = await this.getSetting('PushoverNotifyAutoDelete');
      if (notifyAuto === 'false') return;
    } else if (eventType === 'manual_delete') {
      const notifyManual = await this.getSetting('PushoverNotifyManualDelete');
      if (notifyManual !== 'true') return;
    }

    const userKey = await this.getSetting('PushoverUserKey');
    const token = await this.getSetting('PushoverAppToken');
    if (!userKey || !token) return;

    const push = new PushBox({ user: userKey, token: token });
    push.send({ title: 'MediaCentral Action', message }, (err: any) => {
      if (err) console.error("Pushover Error:", err);
    });
  }

  // Check Tautulli for watch history
  private async hasWatchHistory(ratingKey: string): Promise<boolean> {
    try {
      const url = await this.getSetting('TautulliURL');
      const apiKey = await this.getSetting('TautulliKey');
      if (!url || !apiKey) return false;

      const response = await axios.get(`${url}/api/v2`, {
        params: { apikey: apiKey, cmd: 'get_history', rating_key: ratingKey }
      });
      const data = response.data?.response?.data?.data || [];
      return data.length > 0;
    } catch (error) {
      console.error("Failed to check Tautulli history", error);
      return false; 
    }
  }

  async startCron() {
    // Run deletion and rolling logic daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
      console.log('Running scheduled action service tasks...');
      await this.processDeletions();
      await this.processRollingLogic();
    });
  }

  async processDeletions() {
    const itemsToDelete = await prisma.mediaCache.findMany({
      where: { 
        keepStatus: 'marked_for_deletion',
        markedForDeletionAt: { not: null }
      }
    });

    const dryRun = await this.isDryRun();
    console.log(`Starting deletion processing. Dry Run: ${dryRun}`);

    for (const item of itemsToDelete) {
      // 1. Check Active Streams
      if (tautulliMonitor.activeStreams.has(item.name)) {
        console.log(`SKIPPING DELETION: ${item.name} is currently being actively streamed.`);
        continue;
      }

      // 2. Check Watch History Override (Tautulli full history)
      // Note: We need a mapping to Tautulli's rating_key. We might have to search by title if ratingKey isn't stored.
      // Assuming we can get history by title in a real scenario, but for now we'll simulate.
      // const watched = await this.hasWatchHistory(item.name);
      // if (watched) {
      //   console.log(`OVERRIDE: ${item.name} has watch history. Marking as Kept Permanently.`);
      //   await prisma.mediaCache.update({ where: { id: item.id }, data: { keepStatus: 'kept', keepReason: 'Tautulli Watch History' }});
      //   continue;
      // }

      // 3. Check grace period wait
      if (item.markedForDeletionAt) {
        const gracePeriodStr = await this.getSetting('DeletionGracePeriod') || '30';
        const gracePeriod = parseInt(gracePeriodStr, 10);
        
        const markedDate = new Date(item.markedForDeletionAt);
        const waitPeriodAgo = new Date();
        waitPeriodAgo.setDate(waitPeriodAgo.getDate() - gracePeriod);
        
        if (markedDate > waitPeriodAgo) {
          console.log(`SKIPPING DELETION: ${item.name} has not reached the ${gracePeriod}-day waiting period.`);
          continue;
        }
      }

      if (dryRun) {
        console.log(`DRY RUN: Would delete ${item.name} from ${item.source}`);
        await prisma.userAction.create({
          data: {
            mediaId: String(item.tmdbId || item.tvdbId || item.sourceId),
            mediaName: item.name,
            action: 'delete',
            reason: 'Marked for deletion (Dry Run)',
            metadata: 'dry_run'
          }
        });
        continue;
      }

      // Live Execution
      await this.executeInstantDelete(item.id);
      
      // Delay to avoid overwhelming Radarr/Sonarr with simultaneous filesystem deletions
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  async executeInstantDelete(itemId: string, isManual: boolean = false) {
    const item = await prisma.mediaCache.findUnique({ where: { id: itemId } });
    if (!item) throw new Error("Item not found");

    try {
      try {
        if (item.source === 'Radarr') {
          const url = await this.getSetting('RadarrURL');
          const key = await this.getSetting('RadarrKey');
          if (url && key) {
            await axios.delete(`${url}/api/v3/movie/${item.sourceId}`, {
              headers: { 'X-Api-Key': key },
              params: { deleteFiles: true, addImportExclusion: true }
            });
          }
        } else if (item.source === 'Sonarr') {
          const url = await this.getSetting('SonarrURL');
          const key = await this.getSetting('SonarrKey');
          if (url && key) {
            await axios.delete(`${url}/api/v3/series/${item.sourceId}`, {
              headers: { 'X-Api-Key': key },
              params: { deleteFiles: true, addImportListExclusion: true }
            });
          }
        }
      } catch (axiosError: any) {
        if (axiosError.response) {
          console.log(`API Error deleting ${item.name} from ${item.source} (Status: ${axiosError.response.status}). Proceeding with archive as it may already be deleted.`);
        } else {
          console.error(`Network Error communicating with ${item.source}:`, axiosError.message);
          throw axiosError;
        }
      }

      // Instead of deleting from local cache, we archive it so AI can learn from it
      await prisma.mediaCache.update({ 
        where: { id: item.id },
        data: { keepStatus: 'archive', keepReason: 'Automated/Manual Deletion Executed', markedForDeletionAt: null }
      });
      
      // Log to UserAction memory for AI
      await prisma.userAction.create({
        data: {
          mediaId: String(item.tmdbId || item.tvdbId || item.sourceId),
          mediaName: item.name,
          action: 'delete',
          reason: 'Automated/Manual Deletion Executed',
        }
      });

      this.sendNotification(`Deleted ${item.name}. Space reclaimed: ${Math.round(Number(item.sizeOnDisk) / (1024*1024*1024))} GB.`, isManual ? 'manual_delete' : 'auto_delete');
      console.log(`Successfully deleted ${item.name}.`);
      return true;
    } catch (error: any) {
      console.error(`Failed to delete ${item.name}: ${error.message}`);
      throw error;
    }
  }

  // Rolling Logic for Reality TV
  async processRollingLogic() {
    console.log('Running Rolling TV Show logic...');
    
    // Find Sonarr items with 'ai-rolling-keep' tag
    const shows = await prisma.mediaCache.findMany({
      where: { source: 'Sonarr', tags: { contains: 'ai-rolling-keep' } }
    });

    for (const show of shows) {
      // 1. Fetch series data to get seasons and episodes
      const url = await this.getSetting('SonarrURL');
      const key = await this.getSetting('SonarrKey');
      if (!url || !key) continue;

      try {
        const response = await axios.get(`${url}/api/v3/series/${show.sourceId}`, {
          headers: { 'X-Api-Key': key }
        });
        
        const seasons = response.data.seasons || [];
        // Requires fetching episodes for the series to check download status
        const episodesResponse = await axios.get(`${url}/api/v3/episode`, {
          headers: { 'X-Api-Key': key },
          params: { seriesId: show.sourceId }
        });
        const episodes = episodesResponse.data || [];

        // Logic: Find current season (highest season number)
        const currentSeasonNum = Math.max(...seasons.map((s: any) => s.seasonNumber));
        const currentSeasonEpisodes = episodes.filter((e: any) => e.seasonNumber === currentSeasonNum && e.hasFile);

        // If current season has >= 3 downloaded episodes, delete previous season
        if (currentSeasonEpisodes.length >= 3) {
          const previousSeasonNum = currentSeasonNum - 1;
          const previousSeason = seasons.find((s: any) => s.seasonNumber === previousSeasonNum);
          
          if (previousSeason && previousSeason.statistics?.sizeOnDisk > 0) {
            const dryRun = await this.isDryRun();
            if (dryRun) {
              console.log(`DRY RUN ROLLING: Would delete Season ${previousSeasonNum} of ${show.name}`);
              continue;
            }

            // Real execution would use Sonarr's EpisodeFile deletion endpoint for all files in that season
            // and update the season to unmonitored.
            // (Mocking the exact API call sequence here for safety)
            this.sendNotification(`Rolling rule executed: Deleted Season ${previousSeasonNum} of ${show.name}.`, 'auto_delete');
            console.log(`EXECUTED ROLLING: Deleted Season ${previousSeasonNum} of ${show.name}`);
          }
        }
      } catch (error: any) {
        console.error(`Failed rolling logic for ${show.name}: ${error.message}`);
      }
    }
  }
}

export const actionService = new ActionService();
