const axios = require('axios');
const Database = require('better-sqlite3');
const db = new Database('./dev.db');

async function test() {
  const urlRow = db.prepare("SELECT value FROM Setting WHERE key = 'TautulliURL'").get();
  const keyRow = db.prepare("SELECT value FROM Setting WHERE key = 'TautulliKey'").get();
  
  if (!urlRow || !keyRow) return console.log("Missing Tautulli settings");
  const response = await axios.get(`${urlRow.value}/api/v2`, {
    params: { apikey: keyRow.value, cmd: 'get_activity' }
  });
  const sessions = response.data?.response?.data?.sessions || [];
  console.log("Sessions count:", sessions.length);
  
  const userSessions = {};
  for (const session of sessions) {
    const username = session.user;
    const ip = session.ip_address;
    if (!userSessions[username]) userSessions[username] = [];
    const hasDifferentIp = userSessions[username].some(existing => existing.ip_address !== ip);
    console.log(`Checking ${username}: ip=${ip} hasDifferentIp=${hasDifferentIp}`);
    if (hasDifferentIp) {
      console.log("Would trigger ban for", username);
    } else {
      userSessions[username].push(session);
    }
  }
}
test().catch(console.error);
