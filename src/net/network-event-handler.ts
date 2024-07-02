import { EM } from "../ecs/ecs.js";
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
import { Phase } from "../ecs/sys-phase.js";

export function initNetStateEventSystems() {
  let _peerIDs: Record<string, number> = {};
  function handleNetworkEvents(
    [],
    { eventsFromNetwork }: { eventsFromNetwork: FromNetworkEvent[] }
  ) {
    while (eventsFromNetwork.length > 0) {
      const event = eventsFromNetwork.shift()!;
      switch (event.type) {
        case NetworkEventType.Ready:
          console.log(
            `${window.location.host}/full-screen.html?server=${event.address}${window.location.hash}`
          );
          EM.addResource(NetworkReadyDef, event.address);
          break;
        case NetworkEventType.NewConnection: {
          console.log("new connection");
          let { id } = EM.mk();
          let peer = EM.addComponent(id, PeerDef);
          peer.address = event.address;
          EM.addComponent(id, InboxDef);
          EM.addComponent(id, OutboxDef);
          _peerIDs[peer.address] = id;
          break;
        }
        case NetworkEventType.MessageRecv: {
          let id = _peerIDs[event.from];
          let { inbox } = EM.findEntity(id, [InboxDef])!;
          let message = event.message;
          if (!inbox.has(message.type)) inbox.set(message.type, []);
          inbox.get(message.type)!.push(message.deserializer);
        }
      }
    }
  }
  EM.addSystem(
    "handleNetworkEvents",
    Phase.NETWORK,
    null,
    [EventsFromNetworkDef],
    handleNetworkEvents
  );
}

export function initNetSendOutboxes() {
  function sendOutboxes(
    peers: readonly { peer: Peer; outbox: Outbox }[],
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
  EM.addSystem(
    "sendOutboxes",
    Phase.NETWORK,
    [OutboxDef, PeerDef],
    [EventsToNetworkDef],
    sendOutboxes
  );
}
