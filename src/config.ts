import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  DATABASE_PATH: z.string().min(1).default("./data/tasks.db"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

export type AppConfig = {
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly host: string;
  readonly databasePath: string;
  readonly logLevel: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
};

/**
 * Validate the environment and return a frozen config object.
 * This is the only place in the codebase that reads `process.env`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse({
    NODE_ENV: env.NODE_ENV,
    PORT: env.PORT,
    HOST: env.HOST,
    DATABASE_PATH: env.DATABASE_PATH,
    LOG_LEVEL: env.LOG_LEVEL,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return Object.freeze({
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    databasePath: parsed.data.DATABASE_PATH,
    logLevel: parsed.data.LOG_LEVEL,
  });
}

/** Loopback-only detection used to warn when the no-auth API is exposed. */
export function isLoopbackHost(host: string): boolean {
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}
