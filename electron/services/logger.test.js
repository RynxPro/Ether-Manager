import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "./logger.js";

function withConsoleSpy(method, fn) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => {
    calls.push(args);
  };

  try {
    fn(calls);
  } finally {
    console[method] = original;
  }
}

test("logger emits scoped info logs when enabled", () => {
  const previous = process.env.AETHER_LOG_LEVEL;
  process.env.AETHER_LOG_LEVEL = "info";

  try {
    withConsoleSpy("info", (calls) => {
      const logger = createLogger("main");
      logger.info("started");
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], ["[AetherManager:main]", "started"]);
    });
  } finally {
    process.env.AETHER_LOG_LEVEL = previous;
  }
});

test("logger suppresses lower-priority logs", () => {
  const previous = process.env.AETHER_LOG_LEVEL;
  process.env.AETHER_LOG_LEVEL = "warn";

  try {
    withConsoleSpy("info", (calls) => {
      const logger = createLogger("mods");
      logger.info("scan complete");
      assert.equal(calls.length, 0);
    });
  } finally {
    process.env.AETHER_LOG_LEVEL = previous;
  }
});

test("logger includes metadata on warnings", () => {
  const previous = process.env.AETHER_LOG_LEVEL;
  process.env.AETHER_LOG_LEVEL = "warn";

  try {
    withConsoleSpy("warn", (calls) => {
      const logger = createLogger("ipc");
      logger.warn("fallback used", { channel: "get-config" });
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], [
        "[AetherManager:ipc]",
        "fallback used",
        { channel: "get-config" },
      ]);
    });
  } finally {
    process.env.AETHER_LOG_LEVEL = previous;
  }
});
