const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.plexUser.findMany();
  console.log(JSON.stringify(users, null, 2));
}

main().finally(() => prisma.$disconnect());
