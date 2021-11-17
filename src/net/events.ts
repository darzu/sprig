import { vec3 } from "../gl-matrix.js";
import { EntityManager, EM } from "../entity-manager.js";
import { Serializer, Deserializer } from "../serialize.js";
import { MAX_MESSAGE_SIZE, MessageType } from "./message.js";
import {
  MeDef,
  Me,
  Outbox,
  OutboxDef,
  Peer,
  PeerDef,
  HostDef,
  Inbox,
  InboxDef,
  AuthorityDef,
} from "./components.js";
import { hashCode } from "../util.js";

export interface Event {
  type: string;
  seq: number;
  entities: number[];
  location: vec3 | null;
}

const EVENT_TYPES: Map<number, string> = new Map();

function serializeEvent(event: Event, buf: Serializer) {
  buf.writeUint32(hashCode(event.type));
  buf.writeUint32(event.seq);
  buf.writeUint8(event.entities.length);
  for (const id of event.entities) buf.writeUint32(id);
  if (event.location) {
    buf.writeUint8(1);
    buf.writeVec3(event.location);
  } else {
    buf.writeUint8(0);
  }
}

function deserializeEvent(buf: Deserializer): Event {
  let typeCode = buf.readUint32();
  if (!EVENT_TYPES.has(typeCode)) {
    throw `Tried to deserialize unrecognized event type ${typeCode}`;
  }
  const type = EVENT_TYPES.get(typeCode)!;
  const seq = buf.readUint32();
  const entities = [];
  const numEntities = buf.readUint8();
  for (let i = 0; i < numEntities; i++) entities.push(buf.readUint32());
  const hasLocation = buf.readUint8();
  const location = hasLocation ? buf.readVec3() : null;
  return { type, seq, entities, location };
}

export type DetectedEvent = Pick<Event, "type" | "entities" | "location">;

function serializeDetectedEvent(event: DetectedEvent, buf: Serializer) {
  buf.writeUint32(hashCode(event.type));
  buf.writeUint8(event.entities.length);
  for (const id of event.entities) buf.writeUint32(id);
  if (event.location) {
    buf.writeUint8(1);
    buf.writeVec3(event.location);
  } else {
    buf.writeUint8(0);
  }
}

function deserializeDetectedEvent(buf: Deserializer): DetectedEvent {
  let typeCode = buf.readUint32();
  if (!EVENT_TYPES.has(typeCode)) {
    throw `Tried to deserialize unrecognized event type ${typeCode}`;
  }
  const type = EVENT_TYPES.get(typeCode)!;
  const entities = [];
  const numEntities = buf.readUint8();
  for (let i = 0; i < numEntities; i++) entities.push(buf.readUint32());
  const hasLocation = buf.readUint8();
  const location = hasLocation ? buf.readVec3() : null;
  return { type, entities, location };
}

export interface EventHandler {
  eventAuthorityEntity: (entities: number[]) => number;
  legalEvent: (em: EntityManager, entities: number[]) => boolean;
  runEvent: (
    em: EntityManager,
    entities: number[],
    location: vec3 | null
  ) => void;
}

const EVENT_HANDLERS: Map<string, EventHandler> = new Map();
export function registerEventHandler(type: string, handler: EventHandler) {
  EVENT_TYPES.set(hashCode(type), type);
  EVENT_HANDLERS.set(type, handler);
}

registerEventHandler("test", {
  eventAuthorityEntity: (l: number[]) => l[0],
  legalEvent: () => true,
  runEvent: () => {
    console.log("event running");
  },
});

function eventAuthorityEntity(type: string, entities: number[]): number {
  if (!EVENT_HANDLERS.has(type))
    throw `No event handler registered for event type ${type}`;
  return EVENT_HANDLERS.get(type)!.eventAuthorityEntity(entities);
}

function legalEvent(type: string, em: EntityManager, event: DetectedEvent) {
  if (!EVENT_HANDLERS.has(type))
    throw `No event handler registered for event type ${type}`;
  return EVENT_HANDLERS.get(type)!.legalEvent(em, event.entities);
}

function runEvent(type: string, em: EntityManager, event: Event) {
  if (!EVENT_HANDLERS.has(type))
    throw `No event handler registered for event type ${type}`;
  return EVENT_HANDLERS.get(type)!.runEvent(em, event.entities, event.location);
}

export const DetectedEventsDef = EM.defineComponent(
  "detectedEvents",
  () => [] as DetectedEvent[]
);

export const EventRequestsDef = EM.defineComponent(
  "requestedEvents",
  () => [] as DetectedEvent[]
);

export const EventsDef = EM.defineComponent("events", () => ({
  log: [] as Event[],
  last: -1,
}));

// TODO: this function is bad and we should find a way to do without it
function takeEventsWithKnownObjects<E extends DetectedEvent>(
  em: EntityManager,
  events: E[]
): E[] {
  const result = [];
  const remainingEvents = [];
  while (events.length > 0) {
    let event = events.shift()!;
    if (event.entities.every((id) => em.hasEntity(id))) {
      result.push(event);
    } else {
      remainingEvents.push(event);
    }
  }
  while (remainingEvents.length > 0) {
    events.push(remainingEvents.shift()!);
  }
  return result;
}

export function registerEventSystems(em: EntityManager) {
  function detectedEventsToRequestedEvents(
    [],
    {
      detectedEvents,
      requestedEvents,
      me,
    }: {
      detectedEvents: DetectedEvent[];
      requestedEvents: DetectedEvent[];
      me: Me;
    }
  ) {
    while (detectedEvents.length > 0) {
      const event = detectedEvents.shift()!;
      const authorityId = eventAuthorityEntity(event.type, event.entities);
      const { authority } = em.findEntity(authorityId, [AuthorityDef])!;
      if (authority.pid == me.pid) {
        requestedEvents.push(event);
      }
    }
  }

  em.registerSystem(
    null,
    [DetectedEventsDef, EventRequestsDef, MeDef],
    detectedEventsToRequestedEvents
  );

  // This runs only at the host
  function requestedEventsToEvents(
    [],
    {
      requestedEvents,
      events,
    }: { requestedEvents: DetectedEvent[]; events: { log: Event[] } }
  ) {
    const q = takeEventsWithKnownObjects(em, requestedEvents);
    for (let detectedEvent of q.values()) {
      if (legalEvent(detectedEvent.type, em, detectedEvent)) {
        let event = detectedEvent as Event;
        event.seq = events.log.length;
        events.log.push(event);
      }
    }
  }

  em.registerSystem(
    null,
    [EventRequestsDef, EventsDef, HostDef],
    requestedEventsToEvents
  );

  function requestedEventsToHost(
    hostOutboxes: { outbox: Outbox }[],
    { requestedEvents }: { requestedEvents: DetectedEvent[] }
  ) {
    if (hostOutboxes.length === 0) return;
    const outbox = hostOutboxes[0].outbox;
    const q = takeEventsWithKnownObjects(em, requestedEvents);
    for (let detectedEvent of q.values()) {
      if (legalEvent(detectedEvent.type, em, detectedEvent)) {
        const message = new Serializer(MAX_MESSAGE_SIZE);
        message.writeUint8(MessageType.EventRequest);
        serializeDetectedEvent(detectedEvent, message);
        outbox.reliable.push(message.buffer);
      }
    }
  }

  em.registerSystem(
    [OutboxDef, HostDef],
    [EventRequestsDef],
    requestedEventsToHost
  );

  function processRequestedEvents(
    peers: { inbox: Inbox }[],
    { requestedEvents }: { requestedEvents: DetectedEvent[] }
  ) {
    for (const peer of peers) {
      while ((peer.inbox.get(MessageType.EventRequest) || []).length > 0) {
        let message = peer.inbox.get(MessageType.EventRequest)!.shift()!;
        let requestedEvent = deserializeDetectedEvent(message);
        requestedEvents.push(requestedEvent);
      }
    }
  }
  em.registerSystem(
    [InboxDef],
    [EventRequestsDef, HostDef],
    processRequestedEvents
  );

  function sendEvents(
    peers: { peer: Peer; outbox: Outbox }[],
    { events: { last, log } }: { events: { last: number; log: Event[] } }
  ) {
    for (const peer of peers) {
      if (peer.peer.lastEvent < last) {
        const events = log.slice(peer.peer.lastEvent + 1);
        for (const event of events) {
          const message = new Serializer(MAX_MESSAGE_SIZE);
          message.writeUint8(MessageType.Event);
          serializeEvent(event, message);
          peer.outbox.reliable.push(message.buffer);
        }
        peer.peer.lastEvent = last;
      }
    }
  }

  em.registerSystem([PeerDef, OutboxDef], [EventsDef, HostDef], sendEvents);

  function receiveEvents(
    hostInboxes: { inbox: Inbox }[],
    { events: { log } }: { events: { log: Event[] } }
  ) {
    if (hostInboxes.length === 0) return;
    const inbox = hostInboxes[0].inbox;
    while ((inbox.get(MessageType.Event) || []).length > 0) {
      const message = inbox.get(MessageType.Event)!.shift()!;
      const event = deserializeEvent(message);
      log[event.seq] = event;
    }
  }

  em.registerSystem([InboxDef, HostDef], [EventsDef], receiveEvents);

  function runEvents(
    [],
    { events }: { events: { last: number; log: Event[] } }
  ) {
    const newEvents = events.log.slice(events.last + 1);
    if (newEvents.length > 0) {
      for (let event of newEvents) {
        // If we have an undefined event we've got a hole in the log.
        if (!event) break;
        // If we don't know about all of these objects, we're not ready to run
        // this event (or subsequent events)
        if (!event.entities.every((id) => em.hasEntity(id))) break;
        runEvent(event.type, em, event);
        events.last = event.seq;
      }
    }
  }

  em.registerSystem(null, [EventsDef], runEvents);
}

export function addEventComponents(em: EntityManager) {
  em.addSingletonComponent(DetectedEventsDef);
  em.addSingletonComponent(EventRequestsDef);
  em.addSingletonComponent(EventsDef);
}
