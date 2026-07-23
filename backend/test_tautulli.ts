import axios from 'axios';

async function test() {
  try {
    const tUrl = 'http://192.168.2.25:8181';
    const tKey = '137d732e67954646af1ee3e28e0f07d5';
    
    const r = await axios.get(`${tUrl}/api/v2`, {
      params: { apikey: tKey, cmd: 'get_activity' }
    });
    
    console.log('Tautulli activity:', JSON.stringify(r.data?.response?.data, null, 2));
    
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}
test();
