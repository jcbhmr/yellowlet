/**
 * This file defines a niche async ➡ sync Node.js adapter function that runs a
 * function in a `Worker` thread and synchronously waits using `Atomics.wait()`.
 * This isn't the recommended way to run async operations; you should probably
 * use the builtin async/await features of modern JavaScript.
 *
 * ⚠️ Only works in Node.js! Browsers don't have a synchronous API to expose the
 * `MessagePort` queue synchronously.
 *
 * 🛑 Needs a web `Worker` class polyfill! Node.js doesn't currently have a
 * web-compatible `Worker` class implementation.
 *
 * @author Jacob Hummer <jcbhmr@outlook.com> (https://jcbhmr.me/)
 * @license MIT
 * @see https://github.com/un-ts/synckit
 * @see https://gist.github.com/jcbhmr/f7805f83a83b48d506a7d17c4c3c56cd
 * @see https://github.com/developit/web-worker
 * @file
 */

// import "web-worker";
import { receiveMessageOnPort } from "node:worker_threads";

interface OpenMessageData {
  type: "open";
  port: MessagePort;
  signalSharedBuffer: SharedArrayBuffer;
}
interface CallMessageData {
  type: "call";
  id: string;
  this: any;
  arguments: any[];
}
interface FulfilledMessageData {
  type: "fulfilled";
  id: string;
  value: any;
}
interface RejectedMessageData {
  type: "rejected";
  id: string;
  reason: any;
}

function workerMain(f: (...args: any[]) => any): any {
  function isTransferable(o: unknown): o is Transferable {
    return (
      !!o &&
      typeof o === "object" &&
      (ArrayBuffer.prototype.isPrototypeOf(o) ||
        MessagePort.prototype.isPrototypeOf(o) ||
        ReadableStream.prototype.isPrototypeOf(o) ||
        WritableStream.prototype.isPrototypeOf(o) ||
        TransformStream.prototype.isPrototypeOf(o) ||
        (typeof ImageBitmap !== "undefined" &&
          ImageBitmap.prototype.isPrototypeOf(o)) ||
        (typeof OffscreenCanvas !== "undefined" &&
          OffscreenCanvas.prototype.isPrototypeOf(o)))
    );
  }

  globalThis.addEventListener("message", ({ data }) => {
    if (data?.type === "open") {
      const { port, signalSharedBuffer } = data as OpenMessageData;
      const signal = new Int32Array(signalSharedBuffer);

      port.addEventListener("message", async ({ data }) => {
        const { id, this: that, arguments: args } = data as CallMessageData;
        let value: any;
        try {
          value = await f.call(that, ...args);
        } catch (reason) {
          globalThis.postMessage(
            { type: "rejected", id, reason } satisfies RejectedMessageData,
            // @ts-ignore
            [reason].filter(isTransferable)
          );
          signal[0] = 2;
          Atomics.notify(signal, 0);
          return;
        }
        globalThis.postMessage(
          { type: "fulfilled", id, value } satisfies FulfilledMessageData,
          // @ts-ignore
          [value].filter(isTransferable)
        );
        signal[0] = 2;
        Atomics.notify(signal, 0);
      });
      port.start();
    }
  });
}

const finalizationRegistry = new FinalizationRegistry((worker: Worker) => {
  worker.terminate();
});

/**
 * Launches a new `Worker` thread to run the async function in and returns a
 * reusable function to call out to the worker thread. The resulting function
 * will always be asynchronous, even if the provided function was async. This
 * lets you convert an async function into a sync function.
 *
 * @param f The async function to offload onto a web worker. This function is
 *   stringified, so make sure all the appropriate data is included verbatim in
 *   the function body, or passed in as arguments.
 * @returns A function that runs the original `f` argument in the web worker and
 *   synchronously uses `Atomics.wait()` to wait for the return value.
 * @throws {TypeError} If the provided argument is not a function.
 * @example
 * ```js
 * const get = yellowlet(async (url) => {
 *   const response = await fetch(url);
 *   return await response.text();
 * });
 * const text = get("https://example.org/");
 * //=> '<!DOCTYPE html>...'
 * ```
 */
function yellowlet<T extends any[], U, V>(
  f: (this: V, ...args: T) => U
): (this: V, ...args: T) => Awaited<U> {
  if (typeof f !== "function") {
    throw new TypeError("f is not a function");
  }

  const worker = new Worker(
    "data:text/javascript;base64," + btoa(`(${workerMain})(${f})`),
    { type: "module", name: "greenlet:" + f.name }
  );
  const { port1: port, port2: portForWorker } = new MessageChannel();
  const signalSharedBuffer = new SharedArrayBuffer(4);
  // 0=available, 1=pending, 2=resolved
  const signal = new Int32Array(signalSharedBuffer);

  worker.postMessage(
    {
      type: "open",
      port: portForWorker,
      signalSharedBuffer,
    } satisfies OpenMessageData,
    [portForWorker]
  );

  // @ts-ignore
  worker[Symbol.for("worker")]?.unref();
  // @ts-ignore
  worker.nodeWorker?.unref();

  port.start();

  function run(this: V, ...args: T): Awaited<U> {
    const id = Math.random().toString(36).slice(2, 6);

    signal[0] = 1;
    const that = this === globalThis ? undefined : this;
    port.postMessage(
      {
        type: "call",
        id,
        this: that,
        arguments: args,
      } satisfies CallMessageData,
      args.filter(isTransferable)
    );

    Atomics.wait(signal, 0, 1);
    signal[0] = 0;

    // @ts-ignore
    const messageContainer = receiveMessageOnPort(port)!;
    const data = messageContainer.message;

    if (data?.id === id) {
      const data2 = data as FulfilledMessageData | RejectedMessageData;
      if (data2.type === "fulfilled") {
        return data2.value as Awaited<U>;
      } else if (data2.type === "rejected") {
        throw data2.reason;
      } else {
        throw {};
      }
    } else {
      throw {};
    }
  }
  Object.defineProperty(run, "name", { value: f.name, configurable: true });
  Object.defineProperty(run, "length", { value: f.length, configurable: true });

  finalizationRegistry.register(run, worker);

  return run;
}

export default yellowlet;
