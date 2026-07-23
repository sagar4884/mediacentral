import axios from 'axios';
import cron from 'node-cron';
import { prisma } from '../index';
import { tautulliMonitor } from './tautulliMonitor';
import PushBox from 'pushover-notifications';
import { GoogleGenAI } from '@google/genai';
import { syncService } from './syncService';

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

    // Run AI scan for rolling shows every Sunday at 4 AM if enabled
    cron.schedule('0 4 * * 0', async () => {
      const autoAi = await this.getSetting('EnableAutoRollingAI');
      if (autoAi === 'true') {
        console.log('Running scheduled AI scan for rolling shows...');
        await this.scanForRollingShows();
      }
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

  async processRollingLogic() {
    console.log('Running Rolling TV Show logic...');
    const autoDelete = await this.getSetting('EnableAutoRollingDelete');
    const globalKeep = Number(await this.getSetting('GlobalRollingKeepEpisodes')) || 3;
    
    // Find Sonarr items with 'ai-rolling-keep' tag in MediaCache
    const mediaItems = await prisma.mediaCache.findMany({
      where: { 
        source: 'Sonarr',
        tags: { contains: 'ai-rolling-keep' }
      }
    });

    const pendingDeletions = [];

    for (const item of mediaItems) {
      const sonarrId = Number(item.sourceId);
      const showOverride = await prisma.rollingShow.findUnique({ where: { sonarrId } });
      const keepEpisodes = showOverride?.keepEpisodes ?? globalKeep;

      // 1. Fetch series data to get seasons and episodes
      const url = await this.getSetting('SonarrURL');
      const key = await this.getSetting('SonarrKey');
      if (!url || !key) continue;

      try {
        const response = await axios.get(`${url}/api/v3/series/${item.sourceId}`, {
          headers: { 'X-Api-Key': key }
        });
        
        const seasons = response.data.seasons || [];
        const episodesResponse = await axios.get(`${url}/api/v3/episode`, {
          headers: { 'X-Api-Key': key },
          params: { seriesId: item.sourceId }
        });
        const episodes = episodesResponse.data || [];

        // Find current season (highest season number)
        const currentSeasonNum = Math.max(...seasons.map((s: any) => s.seasonNumber));
        const currentSeasonEpisodes = episodes.filter((e: any) => e.seasonNumber === currentSeasonNum && e.hasFile);

        // If current season has >= keepEpisodes downloaded episodes, flag previous season
        if (currentSeasonEpisodes.length >= keepEpisodes) {
          const previousSeasonNum = currentSeasonNum - 1;
          const previousSeason = seasons.find((s: any) => s.seasonNumber === previousSeasonNum);
          
          if (previousSeason && previousSeason.statistics?.sizeOnDisk > 0) {
             pendingDeletions.push({ item, previousSeasonNum });
          }
        }
      } catch (error: any) {
        console.error(`Failed rolling logic for ${item.name}: ${error.message}`);
      }
    }

    if (pendingDeletions.length === 0) return;

    if (autoDelete === 'true') {
      const dryRun = await this.isDryRun();
      for (const { item, previousSeasonNum } of pendingDeletions) {
        if (dryRun) {
          console.log(`DRY RUN ROLLING: Would delete and unmonitor Season ${previousSeasonNum} of ${item.name}`);
        } else {
          await this.executeManualRolling([{ sonarrId: Number(item.sourceId), seasonNumber: previousSeasonNum }]);
        }
      }
    } else {
       // Send notification that there are pending deletions
       const showNames = pendingDeletions.map(p => p.item.name).join(', ');
       this.sendNotification(`Rolling TV Shows are ready to be deleted: ${showNames}. Please visit the Dashboard to execute.`, 'auto_delete');
    }
  }



  async executeManualRolling(selections: { sonarrId: number, seasonNumber: number }[]) {
    const url = await this.getSetting('SonarrURL');
    const key = await this.getSetting('SonarrKey');
    if (!url || !key) throw new Error("Sonarr credentials not set");

    const results = [];
    for (const selection of selections) {
      try {
        // 1. Get the series to get the exact season information and update it
        const seriesRes = await axios.get(`${url}/api/v3/series/${selection.sonarrId}`, {
          headers: { 'X-Api-Key': key }
        });
        const series = seriesRes.data;
        
        // 2. Fetch all episode files for this series
        const episodeFilesRes = await axios.get(`${url}/api/v3/episodefile`, {
          headers: { 'X-Api-Key': key },
          params: { seriesId: selection.sonarrId }
        });
        const episodeFiles = episodeFilesRes.data || [];
        
        // 3. Filter files by seasonNumber
        const filesToDelete = episodeFiles.filter((f: any) => f.seasonNumber === selection.seasonNumber);
        
        // 4. Delete the files in bulk via EpisodeFile API
        const fileIds = filesToDelete.map((f: any) => f.id);
        if (fileIds.length > 0) {
          await axios.delete(`${url}/api/v3/episodefile/bulk`, {
            headers: { 'X-Api-Key': key },
            data: { episodeFileIds: fileIds }
          });
        }
        
        // 5. Unmonitor the season
        const seasonIndex = series.seasons.findIndex((s: any) => s.seasonNumber === selection.seasonNumber);
        if (seasonIndex !== -1) {
          series.seasons[seasonIndex].monitored = false;
          await axios.put(`${url}/api/v3/series/${selection.sonarrId}`, series, {
            headers: { 'X-Api-Key': key }
          });
        }
        
        this.sendNotification(`Executed rolling deletion for ${series.title} Season ${selection.seasonNumber}. Deleted ${fileIds.length} episodes and unmonitored season.`, 'auto_delete');
        results.push({ sonarrId: selection.sonarrId, success: true, deletedCount: fileIds.length });
      } catch (error: any) {
        console.error(`Failed executing manual rolling for ID ${selection.sonarrId}: ${error.message}`);
        results.push({ sonarrId: selection.sonarrId, success: false, error: error.message });
      }
    }
    return results;
  }

  async scanForRollingShows() {
    const url = await this.getSetting('SonarrURL');
    const key = await this.getSetting('SonarrKey');
    const geminiKey = await this.getSetting('GeminiKey');
    
    if (!url || !key || !geminiKey) throw new Error("Missing Sonarr or Gemini credentials");

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const model = (await this.getSetting('GeminiScoreModel')) || 'gemini-1.5-flash';

    // First sync Sonarr
    await syncService.syncSonarr();

    // Fetch all Sonarr series from local cache
    const sonarrShows = await prisma.mediaCache.findMany({
      where: { source: 'Sonarr' }
    });

    // Filter out shows that are already pending or active in RollingShow table
    const existingRolling = await prisma.rollingShow.findMany();
    const existingIds = new Set(existingRolling.map(r => r.sonarrId));
    
    const candidates = sonarrShows.filter((s: any) => {
      const tags = JSON.parse(s.tags || '[]');
      const hasKeep = tags.includes('ai-rolling-keep');
      const hasNotKeep = tags.includes('not-rolling-keep');
      
      // Skip if it has either tag, or if it's already pending in RollingShow
      if (hasKeep || hasNotKeep || existingIds.has(Number(s.sourceId))) return false;
      return true;
    });

    if (candidates.length === 0) return;

    // Send to Gemini in batches
    const batchSize = 50;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      
      const prompt = `Review the following TV shows. Identify which ones are daily talk shows, news programs, reality TV, game shows, or other highly episodic content that users typically don't keep long-term (e.g., they watch the latest episodes and don't care about old seasons).
Respond strictly with a JSON object mapping the show's ID to a boolean (true if it should be rolling, false otherwise).
Example: {"12": true, "45": false}
Shows:
${JSON.stringify(batch.map((s: any) => ({ id: s.sourceId, title: s.name })))}\n\nOutput only valid JSON.`;

      try {
        const response = await ai.models.generateContent({
          model: model,
          contents: prompt,
        });

        let text = response.text?.trim() || "{}";
        if (text.startsWith("```json")) text = text.replace(/```json/g, "").replace(/```/g, "").trim();
        if (text.startsWith("```")) text = text.replace(/```/g, "").trim();

        const decisions = JSON.parse(text);

        for (const show of batch) {
          if (decisions[show.sourceId] === true) {
            await prisma.rollingShow.create({
              data: {
                sonarrId: Number(show.sourceId),
                name: show.name,
                status: 'pending', // Pending user confirmation
                aiRecommended: true
              }
            });
          }
        }
      } catch (e) {
        console.error("AI Rolling Scan Batch Failed", e);
      }
    }
  }

  async updateSonarrTag(sonarrId: number, tagLabel: string) {
    const url = await this.getSetting('SonarrURL');
    const key = await this.getSetting('SonarrKey');
    if (!url || !key) return;

    try {
      // 1. Get or create tag
      const tagsRes = await axios.get(`${url}/api/v3/tag`, { headers: { 'X-Api-Key': key } });
      let tag = tagsRes.data.find((t: any) => t.label === tagLabel);
      
      if (!tag) {
        const createRes = await axios.post(`${url}/api/v3/tag`, { label: tagLabel }, { headers: { 'X-Api-Key': key } });
        tag = createRes.data;
      }

      // 2. Add tag to series
      const seriesRes = await axios.get(`${url}/api/v3/series/${sonarrId}`, { headers: { 'X-Api-Key': key } });
      const series = seriesRes.data;
      
      if (!series.tags.includes(tag.id)) {
        series.tags.push(tag.id);
        await axios.put(`${url}/api/v3/series/${sonarrId}`, series, { headers: { 'X-Api-Key': key } });
      }
    } catch (error: any) {
      console.error(`Failed to update Sonarr tag ${tagLabel} for series ${sonarrId}: ${error.message}`);
    }
  }
}

export const actionService = new ActionService();
