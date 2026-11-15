import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (db push, migrate) needs a direct connection. On Supabase that is the
// "session" connection string (port 5432); the app itself uses the pooled one.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
