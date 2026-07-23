import axios from 'axios';

async function test() {
  try {
    const jUrl = 'http://192.168.2.25:5055';
    const jKey = 'MTA2OGViNDEtNTRkYS00ZDg2LTg0ODAtM2ZlMTYyOTMwMzY0';
    
    const r1 = await axios.get(`${jUrl}/api/v1/request/count`, {
      headers: { 'X-Api-Key': jKey }
    });
    console.log('Jellyseerr count:', JSON.stringify(r1.data, null, 2));
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}
test();
