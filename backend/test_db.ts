import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  try {
    const key = await prisma.setting.findUnique({ where: { key: 'JellyseerrKey' } });
    console.log('JellyseerrKey:', key?.value);
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}
test();
