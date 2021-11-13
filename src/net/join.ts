import { EntityManager } from "../entity-manager.js";
import { Serializer, Deserializer } from "../serialize.js";
import {
  FromNetworkEvent,
  ToNetworkEvent,
  NetworkEventType,
} from "./network-events.js";
import {
  PeerDef,
  Peer,
  MeDef,
  InboxDef,
  Inbox,
  OutboxDef,
  Outbox,
  JoinDef,
  Join,
  NetworkReadyDef,
  EventsToNetworkDef,
  send,
} from "./components.js";
import { MessageType, MAX_MESSAGE_SIZE } from "./message.js";

function registerConnectToServer(em: EntityManager) {
  let f = (
    peers: { peer: Peer }[],
    { join, eventsToNetwork }: { join: Join; eventsToNetwork: ToNetworkEvent[] }
  ) => {
    switch (join.state) {
      case "start":
        eventsToNetwork.push({
          type: NetworkEventType.Connect,
          address: join.address,
        });
        join.state = "connecting";
        break;
      case "connecting":
        // TODO: this is a hacky way to tell if we're connected.
        if (peers.length > 0) {
          // TODO: consider putting this message into the outbox rather than directly on the event queue
          let message = new Serializer(8);
          message.writeUint8(MessageType.Join);
          eventsToNetwork.push({
            type: NetworkEventType.MessageSend,
            to: join.address,
            reliable: true,
            buf: message.buffer,
          });
          em.removeSingletonComponent(JoinDef);
        }
    }
  };
  em.registerSystem(
    [PeerDef],
    [JoinDef, NetworkReadyDef, EventsToNetworkDef],
    f
  );
}

function registerHandleJoin(em: EntityManager) {
  let f = (
    peers: { peer: Peer; inbox: Inbox; outbox: Outbox }[],
    { me }: { me: { pid: number; host: boolean } }
  ) => {
    for (let { peer, inbox, outbox } of peers) {
      while ((inbox.get(MessageType.Join) || []).length > 0) {
        console.log("Received join");
        if (peer.joined) {
          console.log("Got join message for node that already joined");
          continue;
        }
        let peer_addresses = peers
          .filter((peer) => peer.peer.joined)
          .map((peer) => peer.peer.address);
        let message = inbox.get(MessageType.Join)!.shift();
        // TODO: add player object
        let response = new Serializer(MAX_MESSAGE_SIZE);
        response.writeUint8(MessageType.JoinResponse);
        // PID of joining player
        response.writeUint8(peers.length) + 1;
        response.writeUint8(peer_addresses.length);
        for (let peer of peer_addresses) {
          response.writeString(peer);
        }
        send(outbox, response.buffer, true);
        peer.joined = true;
      }
    }
  };
  em.registerSystem([PeerDef, InboxDef, OutboxDef], [MeDef], f);
}

function registerHandleJoinResponse(em: EntityManager) {
  let f = (
    peers: { peer: Peer; inbox: Inbox; outbox: Outbox }[],
    { eventsToNetwork }: { eventsToNetwork: ToNetworkEvent[] }
  ) => {
    for (let { peer, inbox, outbox } of peers) {
      while ((inbox.get(MessageType.JoinResponse) || []).length > 0) {
        let message = inbox.get(MessageType.JoinResponse)!.shift()!;
        // TODO: add player object
        // TODO: this is a hack, need to actually have some system for reserving
        // object ids at each node
        let pid = message.readUint8();
        em.setDefaultRange("net");
        em.setIdRange("net", (pid + 1) * 10000, (pid + 1) * 10000 + 10000);
        let npeers = message.readUint8();
        for (let i = 0; i < npeers; i++) {
          let address = message.readString();
          eventsToNetwork.push({ type: NetworkEventType.Connect, address });
        }
        em.addSingletonComponent(MeDef, pid, false);
      }
    }
  };
  em.registerSystem([PeerDef, InboxDef, OutboxDef], [EventsToNetworkDef], f);
}

export function registerJoinSystems(em: EntityManager) {
  registerConnectToServer(em);
  registerHandleJoin(em);
  registerHandleJoinResponse(em);
}
