type SettleMessageData =
  | {
      type: "settle";
      status: "fulfilled";
      value: any;
    }
  | {
      type: "settle";
      status: "rejected";
      reason: any;
    };

export default SettleMessageData;
