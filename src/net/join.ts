import { EM } from "../ecs/entity-manager.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
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
  HostDef,
  send,
} from "./components.js";
import { MessageType, MAX_MESSAGE_SIZE } from "./message.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";

const JOIN_RETRANSMIT = 100;

function registerConnectToServer() {
  EM.addSystem(
    "connectToServer",
    Phase.NETWORK,
    [PeerDef],
    [JoinDef, NetworkReadyDef, EventsToNetworkDef, TimeDef],
    (peers, { join, eventsToNetwork, time }) => {
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
            EM.addComponent(peers[0].id, HostDef);
            // TODO: consider putting this message into the outbox rather than directly on the event queue
            let message = new Serializer(8);
            message.writeUint8(MessageType.Join);
            eventsToNetwork.push({
              type: NetworkEventType.MessageSend,
              to: join.address,
              buf: message.buffer,
            });
            join.state = "joining";
            join.lastSendTime = time.time;
          }
          break;
        case "joining":
          if (join.lastSendTime + JOIN_RETRANSMIT < time.time) {
            let message = new Serializer(8);
            message.writeUint8(MessageType.Join);
            eventsToNetwork.push({
              type: NetworkEventType.MessageSend,
              to: join.address,
              buf: message.buffer,
            });
            join.state = "joining";
            join.lastSendTime = time.time;
          }
      }
    }
  );
}

function registerHandleJoin() {
  let handleJoin = (
    peers: readonly { peer: Peer; inbox: Inbox; outbox: Outbox }[],
    { me }: { me: { pid: number; host: boolean } }
  ) => {
    for (let { peer, inbox, outbox } of peers) {
      while ((inbox.get(MessageType.Join) || []).length > 0) {
        console.log("Received join");
        let peer_addresses = peers
          .filter(
            (otherPeer) =>
              otherPeer.peer.joined && otherPeer.peer.address !== peer.address
          )
          .map((peer) => peer.peer.address);
        if (!peer.joined) {
          peer.pid = peers.length + 1;
          peer.joined = true;
        }
        let message = inbox.get(MessageType.Join)!.shift();
        let response = new Serializer(MAX_MESSAGE_SIZE);
        response.writeUint8(MessageType.JoinResponse);
        // PID of joining player
        response.writeUint8(peer.pid);
        response.writeUint8(peer_addresses.length);
        for (let peer of peer_addresses) {
          response.writeString(peer);
        }
        send(outbox, response.buffer);
        peer.joined = true;
      }
    }
  };
  EM.addSystem(
    "handleJoin",
    Phase.NETWORK,
    [PeerDef, InboxDef, OutboxDef],
    [MeDef],
    handleJoin
  );
}

function registerHandleJoinResponse() {
  let handleJoinResponse = (
    peers: readonly { peer: Peer; inbox: Inbox; outbox: Outbox }[],
    { eventsToNetwork }: { eventsToNetwork: ToNetworkEvent[] }
  ) => {
    for (let { peer, inbox, outbox } of peers) {
      while ((inbox.get(MessageType.JoinResponse) || []).length > 0) {
        console.log("received join response");
        let message = inbox.get(MessageType.JoinResponse)!.shift()!;
        let join = EM.getResource(JoinDef);
        // TODO: add player object
        // TODO: this is a hack, need to actually have some system for reserving
        // object ids at each node
        if (join) {
          let pid = message.readUint8();
          EM.setDefaultRange("net");
          EM.setIdRange("net", pid * 10000, (pid + 1) * 10000);
          let npeers = message.readUint8();
          for (let i = 0; i < npeers; i++) {
            let address = message.readString();
            eventsToNetwork.push({ type: NetworkEventType.Connect, address });
          }
          EM.addResource(MeDef, pid, false);
          EM.removeResource(JoinDef);
        }
      }
    }
  };
  EM.addSystem(
    "handleJoinResponse",
    Phase.NETWORK,
    [PeerDef, InboxDef, OutboxDef],
    [EventsToNetworkDef],
    handleJoinResponse
  );
}

export function initNetJoinSystems() {
  registerConnectToServer();
  registerHandleJoin();
  registerHandleJoinResponse();
}
