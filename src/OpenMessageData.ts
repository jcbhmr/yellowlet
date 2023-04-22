export default interface OpenMessageData {
  type: "open";
  port: MessagePort;
  signalSharedBuffer: SharedArrayBuffer;
}
