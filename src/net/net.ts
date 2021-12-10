import { Serializer, Deserializer } from "../serialize.js";
import { Peer } from "./peer.js";
import { EntityManager } from "../entity-manager.js";
import { never } from "../util.js";

import { MessageType } from "./message.js";
import {
  NetworkEventType,
  FromNetworkEvent,
  ToNetworkEvent,
} from "./network-events.js";

import {
  NetStatsDef,
  EventsFromNetworkDef,
  EventsToNetworkDef,
} from "./components.js";

const PING_INTERVAL = 1000;

// fraction of state updates to artificially drop
const DROP_PROBABILITY = 0.1;
const DELAY_SENDS = false;
const SEND_DELAY = 500.0;
const SEND_DELAY_JITTER = 10.0;

// weight of existing skew measurement vs. new skew measurement
const SKEW_WEIGHT = 0.5;

class Net {
  public skewEstimate: Record<string, number> = {};
  public pingEstimate: Record<string, number> = {};
  public outgoingEvents: FromNetworkEvent[] = [];

  public processEvents(queue: ToNetworkEvent[]) {
    while (queue.length > 0) {
      const event = queue.shift()!;
      switch (event.type) {
        case NetworkEventType.Connect:
          this.connect(event.address);
          break;
        case NetworkEventType.MessageSend:
          this.send(event.to, event.buf, event.reliable);
          break;
        default:
          never(event, `Bad network event type ${(event as any).type}`);
      }
    }
  }

  constructor() {
    this.peer = new Peer();
    this.peer.onopen = (address: string) => {
      this.outgoingEvents.push({ type: NetworkEventType.Ready, address });
      this.awaitConnections();
      setInterval(() => this.ping(), PING_INTERVAL);
    };
  }

  private peer: Peer;
  private peers: string[] = [];
  private reliableChannels: Record<string, RTCDataChannel> = {};
  private unreliableChannels: Record<string, RTCDataChannel> = {};
  private pingSeq: number = 0;
  private pingTime: number = 0;

  private ping() {
    this.pingSeq++;
    let seq = this.pingSeq;
    let time = performance.now();
    this.pingTime = time;
    let message = new Serializer(5);
    message.writeUint8(MessageType.Ping);
    message.writeUint32(seq);
    for (let address of this.peers) {
      this.send(address, message.buffer, false);
    }
  }

  private send(address: string, message: ArrayBufferView, reliable: boolean) {
    // TODO: figure out if we need to do something smarter than just not sending if the connection isn't present
    let conn = reliable
      ? this.reliableChannels[address]
      : this.unreliableChannels[address];
    if (conn && conn.readyState === "open") {
      if (DELAY_SENDS) {
        if (reliable || Math.random() > DROP_PROBABILITY) {
          setTimeout(
            () => conn.send(message),
            SEND_DELAY + SEND_DELAY_JITTER * Math.random()
          );
        }
      } else {
        conn.send(message);
      }
    }
  }

  private setupChannel(address: string, chan: RTCDataChannel) {
    chan.onmessage = async (ev) => {
      const buf = (ev.data as Blob).arrayBuffer
        ? await (ev.data as Blob).arrayBuffer()
        : (ev.data as ArrayBuffer);
      this.handleMessage(address, buf);
    };
  }

  private handleMessage(address: string, buf: ArrayBuffer) {
    let message = new Deserializer(buf);
    let type = message.readUint8();
    switch (type) {
      case MessageType.Ping: {
        let seq = message.readUint32();
        let resp = new Serializer(9);
        resp.writeUint8(MessageType.Pong);
        resp.writeUint32(seq);
        resp.writeFloat32(performance.now());
        this.send(address, resp.buffer, false);
        break;
      }
      case MessageType.Pong: {
        let time = performance.now();
        let seq = message.readUint32();
        let remoteTime = message.readFloat32();
        // only want to handle this if it's in response to our latest ping
        if (seq !== this.pingSeq) {
          break;
        }
        let rtt = time - this.pingTime;
        let skew = remoteTime - (this.pingTime + rtt / 2);
        if (!this.skewEstimate[address]) {
          this.skewEstimate[address] = skew;
          this.pingEstimate[address] = rtt / 2;
        } else {
          this.skewEstimate[address] =
            SKEW_WEIGHT * this.skewEstimate[address] + (1 - SKEW_WEIGHT) * skew;
          this.pingEstimate[address] =
            SKEW_WEIGHT * this.pingEstimate[address] +
            (1 - SKEW_WEIGHT) * (rtt / 2);
        }
        break;
      }
      default:
        this.outgoingEvents.push({
          type: NetworkEventType.MessageRecv,
          from: address,
          message: { type, deserializer: message },
        });
    }
  }

  private peerConnected(address: string) {
    this.peers.push(address);
    this.outgoingEvents.push({ type: NetworkEventType.NewConnection, address });
  }

  // listen for incoming connections
  private awaitConnections() {
    this.peer.onconnection = (address, channel) => {
      let reliable =
        channel.maxRetransmits === null || channel.maxRetransmits > 0;
      if (reliable) {
        this.reliableChannels[address] = channel;
      } else {
        this.unreliableChannels[address] = channel;
      }
      if (this.reliableChannels[address] && this.unreliableChannels[address]) {
        this.peerConnected(address);
      }
      this.setupChannel(address, channel);
    };
  }

  private connect(address: string) {
    //console.log(`connecting to ${address}`);
    this.peer.connect(address, true).then((reliableChannel) => {
      this.peer.connect(address, false).then((unreliableChannel) => {
        this.reliableChannels[address] = reliableChannel;
        this.unreliableChannels[address] = unreliableChannel;
        this.setupChannel(address, reliableChannel);
        this.setupChannel(address, unreliableChannel);
        this.peerConnected(address);
      });
    });
  }
}

function getStatsFromNet(net: Net) {
  return function system(
    [],
    {
      netStats,
    }: {
      netStats: {
        skewEstimate: Record<string, number>;
        pingEstimate: Record<string, number>;
      };
    }
  ) {
    for (let k of Object.keys(net.skewEstimate)) {
      netStats.skewEstimate[k] = net.skewEstimate[k];
    }
    for (let k of Object.keys(net.pingEstimate)) {
      netStats.pingEstimate[k] = net.pingEstimate[k];
    }
  };
}

function getEventsFromNet(net: Net) {
  return function system(
    [],
    {
      eventsFromNetwork,
    }: {
      eventsFromNetwork: FromNetworkEvent[];
    }
  ) {
    while (net.outgoingEvents.length > 0) {
      eventsFromNetwork.push(net.outgoingEvents.shift()!);
    }
  };
}

function sendEventsToNet(net: Net) {
  return function system(
    [],
    {
      eventsToNetwork,
    }: {
      eventsToNetwork: ToNetworkEvent[];
    }
  ) {
    net.processEvents(eventsToNetwork);
  };
}

export function registerNetSystems(em: EntityManager) {
  const net = new Net();
  // TODO: startup system to set up components
  em.addSingletonComponent(NetStatsDef);
  em.addSingletonComponent(EventsFromNetworkDef);
  em.addSingletonComponent(EventsToNetworkDef);
  em.registerSystem(
    null,
    [NetStatsDef],
    getStatsFromNet(net),
    "getStatsFromNet"
  );
  em.registerSystem(
    null,
    [EventsFromNetworkDef],
    getEventsFromNet(net),
    "getEventsFromNet"
  );
  em.registerSystem(
    null,
    [EventsToNetworkDef],
    sendEventsToNet(net),
    "sendEventsToNet"
  );
}
