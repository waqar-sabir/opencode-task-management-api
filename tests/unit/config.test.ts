import { describe, expect, it } from "vitest";

import { isLoopbackHost, loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("applies defaults when the environment is empty", () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: "development",
      port: 3000,
      host: "127.0.0.1",
      databaseUrl: "postgres://task:task@127.0.0.1:5433/task_management",
      databaseSsl: false,
      databasePoolMax: 10,
      logLevel: "info",
    });
  });

  it("reads and coerces provided values", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      PORT: "8080",
      HOST: "localhost",
      DATABASE_URL: "postgres://user:pass@db:5432/app",
      DATABASE_SSL: "true",
      DATABASE_POOL_MAX: "25",
      LOG_LEVEL: "debug",
    });

    expect(config.port).toBe(8080);
    expect(config.host).toBe("localhost");
    expect(config.databaseUrl).toBe("postgres://user:pass@db:5432/app");
    expect(config.databaseSsl).toBe(true);
    expect(config.databasePoolMax).toBe(25);
    expect(config.logLevel).toBe("debug");
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(loadConfig({}))).toBe(true);
  });

  it("trims a padded host value", () => {
    const config = loadConfig({ HOST: " 127.0.0.1 " });

    expect(config.host).toBe("127.0.0.1");
  });

  it("fails fast on an invalid port", () => {
    expect(() => loadConfig({ PORT: "70000" })).toThrow(
      /Invalid environment configuration: PORT/,
    );
  });

  it("fails fast on an invalid database URL", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://localhost/app" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("fails fast on an invalid pool size", () => {
    expect(() => loadConfig({ DATABASE_POOL_MAX: "0" })).toThrow(
      /DATABASE_POOL_MAX/,
    );
  });

  it("fails fast on an unknown environment name", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});

describe("isLoopbackHost", () => {
  it.each(["127.0.0.1", "127.1.2.3", "::1", "[::1]", "localhost", "LOCALHOST"])(
    "treats %s as loopback",
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each(["0.0.0.0", "::", "example.com", "192.168.1.10"])(
    "treats %s as non-loopback",
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});
