"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const adapter_better_sqlite3_1 = require("@prisma/adapter-better-sqlite3");
const app = (0, express_1.default)();
const adapter = new adapter_better_sqlite3_1.PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./dev.db' });
exports.prisma = new client_1.PrismaClient({ adapter });
app.use((0, cors_1.default)({
    origin: true,
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' })); // Increased limit for large backup imports
app.use((0, cookie_parser_1.default)());
const settings_1 = __importDefault(require("./routes/settings"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const media_1 = __importDefault(require("./routes/media"));
const plex_1 = __importDefault(require("./routes/plex"));
const ai_1 = __importDefault(require("./routes/ai"));
const realtime_1 = __importDefault(require("./routes/realtime"));
const auth_1 = __importDefault(require("./routes/auth"));
const backup_1 = __importDefault(require("./routes/backup"));
const rolling_1 = __importDefault(require("./routes/rolling"));
// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.use('/api/settings', settings_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/media', media_1.default);
app.use('/api/plex', plex_1.default);
app.use('/api/ai', ai_1.default);
app.use('/api/realtime', realtime_1.default);
app.use('/api/auth', auth_1.default);
app.use('/api/backup', backup_1.default);
app.use('/api/rolling', rolling_1.default);
// Import services to start cron jobs
const syncService_1 = require("./services/syncService");
const tautulliMonitor_1 = require("./services/tautulliMonitor");
const actionService_1 = require("./services/actionService");
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on http://0.0.0.0:${PORT}`);
    // Start background jobs
    syncService_1.syncService.startCron();
    tautulliMonitor_1.tautulliMonitor.startCron();
    actionService_1.actionService.startCron();
});
// Global Error Handler to prevent HTML/Text 500 responses
app.use((err, req, res, next) => {
    console.error("Unhandled Global Error:", err);
    res.status(500).json({ error: 'Internal Server Error' });
});
// trigger restart
// trigger restart 2
// trigger restart 3
// trigger restart 4
// trigger restart 5
// trigger restart 6
// trigger restart 7
// trigger restart 8
