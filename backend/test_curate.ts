import { aiService } from './src/services/aiService';

async function test() {
  try {
    console.log("Running AI Curate test...");
    const count = await aiService.curateMedia('Radarr');
    console.log(`Success! Scored ${count} items.`);
  } catch (e: any) {
    console.error('ERROR:', e);
  }
}
test();
