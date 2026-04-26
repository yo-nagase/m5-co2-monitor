import "dotenv/config";
import { defineConfig, env } from "prisma/config";

type Env = {
  DIRECT_URL: string;
  DATABASE_URL: string;
};

// Migrations bypass the pooler. Fall back to DATABASE_URL when DIRECT_URL is unset
// (e.g. local Docker / non-Supabase setups).
const migrationUrl = process.env.DIRECT_URL
  ? env<Env>("DIRECT_URL")
  : env<Env>("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
