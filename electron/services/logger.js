const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
};

function normalizeLevel(level) {
  const candidate = String(level || "").toLowerCase();
  return LOG_LEVELS[candidate] ? candidate : null;
}

function getDefaultLevel() {
  return process.env.NODE_ENV === "development" ? "info" : "warn";
}

function getConfiguredLevel() {
  return normalizeLevel(process.env.AETHER_LOG_LEVEL) || getDefaultLevel();
}

function shouldLog(methodLevel, configuredLevel) {
  return LOG_LEVELS[methodLevel] >= LOG_LEVELS[configuredLevel];
}

function formatMessage(scope, message, meta) {
  const prefix = `[AetherManager:${scope}]`;
  if (meta === undefined) {
    return [prefix, message];
  }
  return [prefix, message, meta];
}

export function createLogger(scope) {
  const emit = (method, message, meta) => {
    const configuredLevel = getConfiguredLevel();
    if (!shouldLog(method, configuredLevel)) {
      return;
    }

    const args = formatMessage(scope, message, meta);
    if (method === "debug") {
      console.debug(...args);
    } else if (method === "info") {
      console.info(...args);
    } else if (method === "warn") {
      console.warn(...args);
    } else {
      console.error(...args);
    }
  };

  return {
    debug(message, meta) {
      emit("debug", message, meta);
    },
    info(message, meta) {
      emit("info", message, meta);
    },
    warn(message, meta) {
      emit("warn", message, meta);
    },
    error(message, meta) {
      emit("error", message, meta);
    },
  };
}
