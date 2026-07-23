import axios from 'axios';

async function test() {
  try {
    const key = 'f16212130f81bd7b23948be5838bff05e2e7ee7e8220c9971b6f716f9b37290c';
    const uUrl = 'http://192.168.2.25:40080';
    const agent = new (require('https').Agent)({ rejectUnauthorized: false });
    
    const query = `query {
            metrics { 
              memory { total, free, used, available, active, buffcache, percentTotal } 
            }
          }`;
    const r1 = await axios.post(`${uUrl}/graphql`, { query }, { headers: { 'x-api-key': key }, httpsAgent: agent, validateStatus: () => true });
    console.log('Memory fields:', JSON.stringify(r1.data.data.metrics.memory, null, 2));
    
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}
test();
