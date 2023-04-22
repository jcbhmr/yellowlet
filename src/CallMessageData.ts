export default interface CallMessageData {
  type: "call";
  id: string;
  this: any;
  arguments: any[];
}
