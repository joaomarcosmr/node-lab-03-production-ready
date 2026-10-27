import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  if ((await prisma.task.count()) > 0) { console.log('tasks already seeded'); return; }
  await prisma.task.createMany({ data: [
    { title: 'Write the deployment runbook', done: false },
    { title: 'Rotate the API token', done: true },
    { title: 'Add readiness probe to the Helm chart', done: false },
  ] });
  console.log('seeded 3 tasks');
}
main().finally(() => prisma.$disconnect());
