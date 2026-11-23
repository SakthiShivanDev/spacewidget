import { parentPort, workerData } from "node:worker_threads";
import { getQuickJS } from "quickjs-emscripten";
try {
  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(16 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const deadline = Date.now() + 500;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const context = runtime.newContext();
  try {
    const input = JSON.stringify(workerData.input);
    const evaluated = context.evalCode(
      `"use strict";\nconst handler = (${workerData.source});\nif (typeof handler !== "function") throw new Error("Handler must be a function"); const result = ${workerData.validateOnly ? "true" : `handler(JSON.parse(${JSON.stringify(input)}))`}; if (result && typeof result.then === "function") throw new Error("Async unsupported"); JSON.stringify(result)`,
      "handler.js",
    );
    if (evaluated.error) {
      evaluated.error.dispose();
      throw new Error("Handler failed or exceeded its limits.");
    }
    const output = context.getString(evaluated.value);
    evaluated.value.dispose();
    if (output.length > 256 * 1024)
      throw new Error("Handler result is too large.");
    const value = JSON.parse(output);
    if (
      value === undefined ||
      value?.then ||
      (value &&
        typeof value === "object" &&
        !Object.keys(value).length &&
        /\basync\b/.test(workerData.source))
    )
      throw new Error("Handlers must return synchronous JSON data.");
    parentPort.postMessage({ value });
  } finally {
    context.dispose();
    runtime.dispose();
  }
} catch {
  parentPort.postMessage({
    error:
      "Handler must return JSON within 500 ms and 16 MB. Network, filesystem, environment and async calls are unavailable; use saved HTTP endpoints for integrations.",
  });
}
