import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' } as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Deleting duplicate user Dhamu16...');
  try {
    const deletedViolations = await prisma.plexViolation.deleteMany({ where: { userId: 'Dhamu16' } });
    console.log(`Deleted ${deletedViolations.count} violations.`);
    const deletedUsers = await prisma.plexUser.deleteMany({ where: { id: 'Dhamu16' } });
    console.log(`Deleted ${deletedUsers.count} users.`);
  } catch (e) {
    console.error(e);
  }
}

main().finally(() => prisma.$disconnect());
