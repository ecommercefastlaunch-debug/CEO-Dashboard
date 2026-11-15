import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// DATABASE_URL is the pooled Supabase connection string in production.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function makeClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** The client or an interactive-transaction handle — helpers accept either. */
export type Db = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0] | PrismaClient;
