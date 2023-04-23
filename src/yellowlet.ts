import Worker from "@jcbhmr/html-worker/Worker.js";
import YellowletWorker from "./yellowlet-worker.ts?worker";
import { receiveMessageOnPort } from "node:worker_threads";

interface YellowletPartial {
  worker: Worker;
}

const finalizationRegistry = new FinalizationRegistry((worker: Worker) => {
  worker.terminate();
});

function yellowlet<T extends (...args: any[]) => any>(function_: T): R {
  type S = (
    this: ThisType<T>,
    ...args: Parameters<T>
  ) => Awaited<ReturnType<T>>;
  type R = YellowletPartial & S;

  if (typeof function_ !== "function") {
    throw new TypeError(`${function_} is not a function`);
  }

  const worker = new YellowletWorker();
  const { port1: port, port2: workerPort } = new MessageChannel();
  const signalSharedBuffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(signalSharedBuffer);
  worker.postMessage(
    {
      type: "yellowlet:open",
      functionSource: "" + function_,
      port: workerPort,
      signalSharedBuffer,
    } satisfies OpenMessageData,
    [workerPort]
  );
  port.start();
  worker.unref!();

  const wrapper = function (...args) {
    const that = this === globalThis ? undefined : this;

    signal[0] = 1;
    port.postMessage({
      type: "yellowlet:call",
      this: that,
      arguments: args,
    });

    Atomics.wait(signal, 0, 1);
    signal[0] = 0;

    const messageContainer = receiveMessageOnPort(port);
    if (!messageContainer) {
      throw new DOMException();
    }
    const data = messageContainer.message as SettleMessageData;
    const { status, value, reason } = data;
    if (status === "fulfilled") {
      return value;
    } else {
      throw reason;
    }
  } satisfies S as R;
  Object.defineProperty(wrapper, "name", {
    value: function_.name,
    configurable: true,
  });
  Object.defineProperty(wrapper, "length", {
    value: function_.length,
    configurable: true,
  });
  wrapper.worker = worker;

  finalizationRegistry.register(wrapper, worker);

  return wrapper;
}
