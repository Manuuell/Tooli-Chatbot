export interface OutboundMessage {
  to: string;  // número en formato E.164: 573001234567
  text?: string;
}

export interface ButtonOption {
  id: string;
  displayText: string;
}

export interface OutboundButtons {
  to: string;
  title: string;
  description: string;
  footer?: string;
  buttons: ButtonOption[];
}

export interface ListRow {
  id: string;          // valor que llega en el webhook al seleccionar
  title: string;       // texto principal de la fila
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface OutboundList {
  to: string;
  title: string;        // título del mensaje (negrita)
  description: string;  // cuerpo del mensaje
  footer?: string;
  buttonText: string;   // texto del botón que despliega la lista, ej: "Opciones"
  sections: ListSection[];
}

export interface InboundMessage {
  from: string;
  messageId: string;
  text: string;  // para botones/lista: llega el id de la opción seleccionada
  timestamp: number;
}

export interface IMessagingAdapter {
  sendText(msg: OutboundMessage): Promise<void>;
  sendButtons(msg: OutboundButtons): Promise<void>;
  sendList(msg: OutboundList): Promise<void>;
  /** Resuelve un identificador de remitente (puede ser @lid) al número E.164 real. */
  resolveSenderId(jid: string): Promise<string>;
}
