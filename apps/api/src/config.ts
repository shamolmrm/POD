/** Environment configuration, validated once at startup. Secrets never get logged. */
export type Config = {
  env: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  publicBaseUrl: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadConfig(): Config {
  return {
    env: process.env.NODE_ENV ?? "development",
    port: Number(process.env.PORT ?? 4000),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  };
}

export const CONFIG = Symbol("CONFIG");
