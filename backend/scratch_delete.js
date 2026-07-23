const Database = require('better-sqlite3');
const db = new Database('./dev.db');
console.log('Deleting...');
let result = db.prepare("DELETE FROM PlexViolation WHERE userId = 'Dhamu16'").run();
console.log(`Deleted ${result.changes} violations.`);
result = db.prepare("DELETE FROM PlexUser WHERE id = 'Dhamu16'").run();
console.log(`Deleted ${result.changes} users.`);
db.close();
