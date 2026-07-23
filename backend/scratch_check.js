const Database = require('better-sqlite3');
const db = new Database('./dev.db');
const user = db.prepare("SELECT * FROM PlexUser WHERE username = 'Dhamu16'").get();
console.log(user);
db.close();
