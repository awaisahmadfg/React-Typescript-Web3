import "dotenv/config";

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: process.env.PORT ?? "5000",
  BIND_HOST: process.env.BIND_HOST,
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-secret-change-me",
};

export function assertServerEnv(): void {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set.");
  }
}
