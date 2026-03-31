import test from "node:test";
import assert from "node:assert/strict";
import {
  fail,
  ok,
  withRawFallback,
  withResultEnvelope,
} from "./ipc.js";

test("ok builds a success envelope", () => {
  assert.deepEqual(ok({ data: 1 }), { success: true, data: 1 });
});

test("fail preserves explicit fields and error message", () => {
  const result = fail(new Error("boom"), { canceled: true });
  assert.deepEqual(result, {
    success: false,
    canceled: true,
    error: "boom",
  });
});

test("withRawFallback returns fallback value when handler throws", async () => {
  const wrapped = withRawFallback("raw-test", null, async () => {
    throw new Error("bad");
  });

  assert.equal(await wrapped(), null);
});

test("withResultEnvelope passes through existing result envelopes", async () => {
  const wrapped = withResultEnvelope("result-test", async () => ({
    success: true,
    data: [1, 2, 3],
  }));

  assert.deepEqual(await wrapped(), {
    success: true,
    data: [1, 2, 3],
  });
});

test("withResultEnvelope converts plain objects into success envelopes", async () => {
  const wrapped = withResultEnvelope("result-test", async () => ({
    records: [],
    total: 0,
  }));

  assert.deepEqual(await wrapped(), {
    success: true,
    records: [],
    total: 0,
  });
});

test("withResultEnvelope converts thrown errors into failure envelopes", async () => {
  const wrapped = withResultEnvelope("result-test", async () => {
    throw new Error("broken");
  });

  assert.deepEqual(await wrapped(), {
    success: false,
    error: "broken",
  });
});
