import { createLogger } from "./logger.js";

const logger = createLogger("ipc");

export function ok(fields = {}) {
  return { success: true, ...fields };
}

export function fail(error, fields = {}) {
  const message =
    fields.error ||
    (error instanceof Error ? error.message : String(error || "Unknown error"));
  return {
    success: false,
    ...fields,
    error: message,
  };
}

function isResultEnvelope(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.success === "boolean"
  );
}

export function withRawFallback(label, fallbackValue, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error(label, error);
      return fallbackValue;
    }
  };
}

export function withResultEnvelope(label, handler) {
  return async (...args) => {
    try {
      const result = await handler(...args);
      if (isResultEnvelope(result)) {
        return result;
      }
      if (result == null) {
        return ok();
      }
      if (typeof result === "object" && !Array.isArray(result)) {
        return ok(result);
      }
      return ok({ data: result });
    } catch (error) {
      logger.error(label, error);
      return fail(error);
    }
  };
}
