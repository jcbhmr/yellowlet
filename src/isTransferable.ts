export default function isTransferable(o: unknown): o is Transferable {
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
