const Database = require('better-sqlite3');
const axios = require('axios');
const db = new Database('dev.db');

async function test() {
  const settings = db.prepare("SELECT key, value FROM Setting").all();
  const config = settings.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  const key = config.GeminiKey;
  const models = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${key.trim()}`;
      await axios.get(url, { timeout: 5000 });
      console.log(`Model ${model}: Success (Green)`);
    } catch (e) {
      console.log(`Model ${model}: Failed`);
    }
  }
}
test();
