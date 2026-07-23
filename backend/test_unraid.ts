import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const urlSetting = await prisma.setting.findUnique({where: {key: 'UnraidURL'}});
    const keySetting = await prisma.setting.findUnique({where: {key: 'UnraidKey'}});
    
    console.log('DB URL:', urlSetting?.value);
    console.log('DB Key:', keySetting?.value ? '***' : 'Missing');

    let uUrl = urlSetting?.value || 'http://192.168.2.25:40080';
    try { uUrl = new URL(uUrl).origin; } catch(e) {}
    
    console.log('Testing URL:', `${uUrl}/graphql`);
    const agent = new (require('https').Agent)({ rejectUnauthorized: false });
    
    const unraidRes = await axios.post(`${uUrl}/graphql`, {
      query: `query { storage { array { size, free } } }`
    }, {
      headers: { 'x-api-key': keySetting?.value || '' },
      timeout: 10000,
      httpsAgent: agent,
      validateStatus: () => true
    });
    
    console.log('STATUS:', unraidRes.status);
    console.log('SERVER:', unraidRes.headers.server);
    console.log('DATA:', typeof unraidRes.data === 'string' ? unraidRes.data.slice(0, 200) : unraidRes.data);
  } catch (e: any) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();
