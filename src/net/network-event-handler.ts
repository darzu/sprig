import { EntityManager } from "../entity-manager.js";
import {
  FromNetworkEvent,
  ToNetworkEvent,
  NetworkEventType,
  MessageRecv,
} from "./network-events.js";
import {
  PeerDef,
  Peer,
  InboxDef,
  OutboxDef,
  Outbox,
  NetworkReadyDef,
  EventsFromNetworkDef,
  EventsToNetworkDef,
} from "./components.js";

export function registerHandleNetworkEvents(em: EntityManager) {
  let _peerIDs: Record<string, number> = {};
  function handleNetworkEvents(
    [],
    { eventsFromNetwork }: { eventsFromNetwork: FromNetworkEvent[] }
  ) {
    while (eventsFromNetwork.length > 0) {
      const event = eventsFromNetwork.shift()!;
      switch (event.type) {
        case NetworkEventType.Ready:
          console.log(`localhost:4321/?server=${event.address}&user=2`);
          em.addSingletonComponent(NetworkReadyDef);
          break;
        case NetworkEventType.NewConnection: {
          console.log("new connection");
          let { id } = em.newEntity();
          let peer = em.addComponent(id, PeerDef);
          peer.address = event.address;
          em.addComponent(id, InboxDef);
          em.addComponent(id, OutboxDef);
          _peerIDs[peer.address] = id;
          break;
        }
        case NetworkEventType.MessageRecv: {
          let id = _peerIDs[event.from];
          let { inbox } = em.findEntity(id, [InboxDef])!;
          let message = event.message;
          if (!inbox.has(message.type)) inbox.set(message.type, []);
          inbox.get(message.type)!.push(message.deserializer);
        }
      }
    }
  }
  em.registerSystem(
    null,
    [EventsFromNetworkDef],
    handleNetworkEvents,
    "handleNetworkEvents"
  );
}

export function registerSendOutboxes(em: EntityManager) {
  function sendOutboxes(
    peers: { peer: Peer; outbox: Outbox }[],
    { eventsToNetwork }: { eventsToNetwork: ToNetworkEvent[] }
  ) {
    for (let {
      peer: { address },
      outbox,
    } of peers) {
      while (outbox.length > 0) {
        const message = outbox.shift()!;
        eventsToNetwork.push({
          type: NetworkEventType.MessageSend,
          to: address,
          buf: message,
        });
      }
    }
  }
  em.registerSystem(
    [OutboxDef, PeerDef],
    [EventsToNetworkDef],
    sendOutboxes,
    "sendOutboxes"
  );
}
