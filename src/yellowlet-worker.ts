import { pEvent } from "p-event";
import isTransferable from "./isTransferable.ts";
import OpenMessageData from "./OpenMessageData.ts";
import CallMessageData from "./CallMessageData.ts";
import SettleMessageData from "./SettleMessageData.ts";

const openEvent = (await pEvent(
  globalThis,
  "message",
  ({ data }) => data?.type === "yellowlet:open"
)) as OpenMessageData;
const { functionSource, signalSharedBuffer, port } = openEvent;
const function_ = (0, eval)(functionSource) as (...args: any[]) => any;
const signal = new Int32Array(signalSharedBuffer);

function handleCall({ channel, that, args }: CallMessageData): any {
  Promise.resolve(function_.call())
    .then((value) => {
      port.postMessage(
        { type: "settle", channel, status: "fulfilled", value },
        [value].filter(isTransferable)
      );
      signal[0] = 2;
      Atomics.notify(signal, 0);
    })
    .catch((reason) => {
      port.postMessage(
        { type: "settle", channel, status: "rejected", reason },
        [reason].filter(isTransferable)
      );
      signal[0] = 2;
      Atomics.notify(signal, 0);
    });
}

port.addEventListener("message", ({ data }) => {
  if (data?.type === "yellowlet:call") {
    handleCall(data as CallMessageData);
  }
});
port.start();
