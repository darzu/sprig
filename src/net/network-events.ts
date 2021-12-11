import { MessageType } from "./message.js";
import { Deserializer } from "../serialize.js";

export enum NetworkEventType {
  Ready,
  NewConnection,
  MessageRecv,
  MessageSend,
  Connect,
  // TODO: close connection?
}

interface Ready {
  type: NetworkEventType.Ready;
  address: string;
}

interface NewConnection {
  type: NetworkEventType.NewConnection;
  address: string;
}

export interface MessageRecv {
  type: NetworkEventType.MessageRecv;
  from: string;
  message: {
    type: MessageType;
    deserializer: Deserializer;
  };
}

interface MessageSend {
  type: NetworkEventType.MessageSend;
  to: string;
  buf: ArrayBufferView;
}

interface Connect {
  type: NetworkEventType.Connect;
  address: string;
}

export type FromNetworkEvent = Ready | NewConnection | MessageRecv;

export type ToNetworkEvent = MessageSend | Connect;
