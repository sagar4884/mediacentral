import { tautulliMonitor } from './src/services/tautulliMonitor';
async function test() {
  console.log("Forcing checkStreams...");
  await tautulliMonitor.checkStreams();
  console.log("Done checkStreams.");
}
test().catch(console.error);
