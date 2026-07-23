const Database = require('better-sqlite3');
const db = new Database('dev.db');

const badUsers = db.prepare("SELECT * FROM PlexUser WHERE id = username OR id LIKE 'tautulli_%'").all();
console.log("Found other duplicates:", badUsers);

db.exec("DELETE FROM PlexUser WHERE id = username OR id LIKE 'tautulli_%'");
