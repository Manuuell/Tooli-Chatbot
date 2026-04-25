export interface OutboundMessage {
  to: string;       // número en formato E.164: 573001234567
  text?: string;
  // Deuda técnica: buttons/lists se agregan aquí cuando ambas APIs los soporten
}

export interface InboundMessage {
  from: string;
  messageId: string;
  text: string;
  timestamp: number;
}

export interface IMessagingAdapter {
  sendText(msg: OutboundMessage): Promise<void>;
  // Futura migración Cloud API: añadir sendTemplate(), sendInteractive()
}
