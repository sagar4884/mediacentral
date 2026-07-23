"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.AIService = void 0;
const genai_1 = require("@google/genai");
const index_1 = require("../index");
class AIService {
    getAi(apiKey) {
        return new genai_1.GoogleGenAI({ apiKey });
    }
    async getSetting(key, defaultValue = '') {
        const setting = await index_1.prisma.setting.findUnique({ where: { key } });
        return setting?.value || defaultValue;
    }
    async getRules(source) {
        return await this.getSetting(`${source}AIRules`, "1. Keep movies with high IMDB scores.\n2. Delete reality TV.");
    }
    async saveRules(source, rules) {
        await index_1.prisma.setting.upsert({
            where: { key: `${source}AIRules` },
            update: { value: rules },
            create: { key: `${source}AIRules`, value: rules }
        });
        // Clear any pending rules since we just saved
        await index_1.prisma.setting.deleteMany({
            where: { key: { in: [`${source}AIPendingRules`, `${source}AIPendingExplanation`] } }
        });
    }
    async curateMedia(source, reportProgress, checkCancelled, selectedIds) {
        const apiKey = await this.getSetting('GeminiKey');
        if (!apiKey)
            throw new Error("Gemini API Key not set");
        const scoreModel = await this.getSetting('GeminiScoreModel', 'gemini-1.5-flash');
        const rules = await this.getRules(source);
        const ai = this.getAi(apiKey);
        const whereClause = { source, keepStatus: 'waiting' };
        if (selectedIds && selectedIds.length > 0) {
            whereClause.id = { in: selectedIds };
        }
        const waitingMedia = await index_1.prisma.mediaCache.findMany({
            where: whereClause,
            select: { id: true, name: true, year: true, tags: true, sizeOnDisk: true, metadata: true }
        });
        if (waitingMedia.length === 0)
            return 0;
        const batchSize = 50;
        let updatedCount = 0;
        let processed = 0;
        for (let i = 0; i < waitingMedia.length; i += batchSize) {
            if (checkCancelled && checkCancelled())
                break;
            const batch = waitingMedia.slice(i, i + batchSize);
            const prompt = `Given these user curation rules for ${source}:\n${rules}\n\nScore the following media items from 1 to 100 on how likely the user is to KEEP it (100 = definitely keep, 1 = definitely delete). Respond strictly with a JSON object mapping the item's ID to the integer score.\nExample: {"id1": 85, "id2": 20}\n\nMedia Items:\n${JSON.stringify(batch.map(m => ({ id: m.id, name: m.name, year: m.year, tags: m.tags, metadata: m.metadata })))}\n\nOutput only valid JSON.`;
            try {
                const response = await ai.models.generateContent({
                    model: scoreModel,
                    contents: prompt,
                });
                let text = response.text?.trim() || "{}";
                if (text.startsWith("```json"))
                    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
                if (text.startsWith("```"))
                    text = text.replace(/```/g, "").trim();
                const scores = JSON.parse(text);
                for (const item of batch) {
                    const score = scores[item.id];
                    if (typeof score === 'number') {
                        await index_1.prisma.mediaCache.update({
                            where: { id: item.id },
                            data: { aiScore: score }
                        });
                        updatedCount++;
                    }
                }
            }
            catch (e) {
                console.error("Batch scoring failed", e);
            }
            processed += batch.length;
            if (reportProgress) {
                reportProgress((processed / waitingMedia.length) * 100);
            }
        }
        return updatedCount;
    }
    async updateRules(source) {
        const apiKey = await this.getSetting('GeminiKey');
        if (!apiKey)
            throw new Error("Gemini API Key not set");
        const learnModel = await this.getSetting('GeminiLearnModel', 'gemini-1.5-pro');
        const ai = this.getAi(apiKey);
        const history = await index_1.prisma.mediaCache.findMany({
            where: {
                source,
                keepStatus: { in: ['kept', 'marked_for_deletion', 'archive'] }
            },
            orderBy: { updatedAt: 'desc' },
            take: 200,
            select: { name: true, keepStatus: true, keepReason: true, tags: true, metadata: true }
        });
        if (history.length < 10) {
            throw new Error("Cold Start: Not enough data. Please manually keep/delete/archive at least 10 items.");
        }
        const currentRules = await this.getRules(source);
        const historyStr = history.map(h => `Name: ${h.name} | Status: ${h.keepStatus} | Reason: ${h.keepReason || 'Manual'} | Tags: ${h.tags}`).join('\n');
        const prompt = `You are an AI curation assistant for a media server. Based on the user's current rules and their recent history, generate a concise, updated set of rules that defines their media preferences. Improve or add to the current rules based on patterns in what they kept vs deleted vs archived.\n\nCurrent Rules:\n${currentRules}\n\nHistory (Status: kept, marked_for_deletion, archive):\n${historyStr}\n\nRespond ONLY with a valid JSON array of objects. Each object represents a rule change or a kept rule. The format MUST be exactly:\n[{"type": "keep" | "add" | "edit" | "remove", "original": "The original rule text (if applicable)", "updated": "The new rule text (if applicable)", "reason": "Reason for this change"}]\nOutput only valid JSON.`;
        try {
            const response = await ai.models.generateContent({
                model: learnModel,
                contents: prompt,
            });
            let text = response.text?.trim() || "[]";
            if (text.startsWith("```json"))
                text = text.replace(/```json/g, "").replace(/```/g, "").trim();
            if (text.startsWith("```"))
                text = text.replace(/```/g, "").trim();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                await index_1.prisma.setting.upsert({
                    where: { key: `${source}AIPendingRules` },
                    update: { value: JSON.stringify(parsed) },
                    create: { key: `${source}AIPendingRules`, value: JSON.stringify(parsed) }
                });
                // We no longer need a separate explanation key, but we'll clear it just in case
                await index_1.prisma.setting.delete({ where: { key: `${source}AIPendingExplanation` } }).catch(() => { });
                return "Rules updated";
            }
            else {
                throw new Error("Invalid JSON schema returned from AI");
            }
        }
        catch (e) {
            console.error("Rule generation failed", e);
            throw new Error("Failed to generate rules: " + e.message);
        }
    }
}
exports.AIService = AIService;
exports.aiService = new AIService();
