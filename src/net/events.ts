import {
  EM,
  Component,
  EDef,
  ESet,
  ComponentDef,
} from "../ecs/entity-manager.js";
import {
  Serializer,
  Deserializer,
  OutOfRoomError,
} from "../utils/serialize.js";
import { MAX_MESSAGE_SIZE, MessageType } from "./message.js";
import {
  MeDef,
  OutboxDef,
  send,
  HostDef,
  InboxDef,
  AuthorityDef,
  HostCompDef,
} from "./components.js";
import { hashCode, NumberTuple } from "../utils/util.js";
import { TimeDef } from "../time/time.js";
// import { PositionDef, RotationDef } from "../physics/transform.js";
import { assert } from "../utils/util.js";
import { Phase } from "../ecs/sys-phase.js";
import { ASSET_LOG_VERT_CHANGES, VERBOSE_NET_LOG } from "../flags.js";

export interface Event<Extra> {
  // Event type
  type: string;
  // Sequence number in the global log of events
  seq: number;
  // originator PID
  // TODO(@darzu): Is this really needed? I/darzu added this b/c I wanted events
  //  w/o any entities so in that case the origPid is used as the authority pid
  origPid: number;
  // ID set at the generating node for dedup-ing
  entities: number[];
  // arbitrary non-entities payload
  extra: Extra;
}

type ExtraSerializers<Extra> = {
  serializeExtra: (buf: Serializer, extra: Extra) => void;
  deserializeExtra: (buf: Deserializer) => Extra;
};

type EventHandler<ES extends EDef<any>[], Extra> = {
  entities: readonly [...ES];
  eventAuthorityEntity: (entities: NumberTuple<ES>) => number;
  legalEvent: (entities: ESet<ES>, extra: Extra) => boolean;
  runEvent: (entities: ESet<ES>, extra: Extra) => void;
} & ({} | ExtraSerializers<Extra>);

const EVENT_TYPES: Map<number, string> = new Map();
const EVENT_HANDLERS: Map<string, EventHandler<any, any>> = new Map();

export function registerEventHandler<ES extends EDef<any>[], Extra>(
  type: string,
  handler: EventHandler<ES, Extra>
): void {
  EVENT_TYPES.set(hashCode(type), type);
  EVENT_HANDLERS.set(type, handler as any);
}

function hasSerializers<ES extends EDef<any>[], Extra>(
  h: EventHandler<ES, Extra>
): h is EventHandler<ES, Extra> & ExtraSerializers<Extra> {
  const hasS = "serializeExtra" in h;
  const hasD = "deserializeExtra" in h;
  assert(hasS === hasD, "mismatched event serializer/deserializer");
  return hasS && hasD;
}

function serializeEvent<Extra>(event: Event<Extra>, buf: Serializer) {
  if (VERBOSE_NET_LOG) console.log(`serializeEvent`); // TODO(@darzu):
  const handler = EVENT_HANDLERS.get(event.type);
  if (!handler)
    throw `Tried to serialize unrecognized event type ${event.type}`;
  buf.writeUint32(hashCode(event.type));
  buf.writeUint32(event.seq);
  assert(event.origPid <= 256, `Pid too big: ${event.origPid}`);
  buf.writeUint8(event.origPid);
  buf.writeUint8(event.entities.length);
  for (const id of event.entities) buf.writeUint32(id);
  if (hasSerializers(handler)) handler.serializeExtra(buf, event.extra);
  else if (event.extra)
    throw `Found extra data but no serializer on event type ${event.type}`;
}

function deserializeEvent<Extra>(buf: Deserializer): Event<Extra> {
  if (VERBOSE_NET_LOG) console.log(`deserializeEvent`); // TODO(@darzu):
  let typeCode = buf.readUint32();
  if (!EVENT_TYPES.has(typeCode)) {
    throw `Tried to deserialize unrecognized event type ${typeCode}`;
  }
  const type = EVENT_TYPES.get(typeCode)!;
  const handler = EVENT_HANDLERS.get(type);
  if (!handler) throw `Tried to deserialize unrecognized event type ${type}`;
  const seq = buf.readUint32();
  const origPid = buf.readUint8();
  const entities = [];
  const numEntities = buf.readUint8();
  for (let i = 0; i < numEntities; i++) entities.push(buf.readUint32());
  let extra;
  if ("serializeExtra" in handler) extra = handler.deserializeExtra(buf);
  return { type, seq, origPid, entities, extra };
}

export type DetectedEvent<Extra> = Pick<
  Event<Extra>,
  "type" | "entities" | "extra" | "origPid"
>;

function serializeDetectedEvent<Extra>(
  event: DetectedEvent<Extra>,
  buf: Serializer
) {
  const handler = EVENT_HANDLERS.get(event.type);
  if (!handler)
    throw `Tried to serialize unrecognized event type ${event.type}`;
  buf.writeUint32(hashCode(event.type));
  buf.writeUint8(event.origPid);
  buf.writeUint8(event.entities.length);
  for (const id of event.entities) buf.writeUint32(id);
  if ("serializeExtra" in handler) handler.serializeExtra(buf, event.extra);
  else if (event.extra)
    throw `Found extra data but no serializer on event type ${event.type}`;
}

function deserializeDetectedEvent<Extra>(
  buf: Deserializer
): DetectedEvent<Extra> {
  let typeCode = buf.readUint32();
  if (!EVENT_TYPES.has(typeCode)) {
    throw `Tried to deserialize unrecognized event type ${typeCode}`;
  }
  const type = EVENT_TYPES.get(typeCode)!;
  const origPid = buf.readUint8();
  const handler = EVENT_HANDLERS.get(type);
  if (!handler) throw `Tried to deserialize unrecognized event type ${type}`;
  const entities = [];
  const numEntities = buf.readUint8();
  for (let i = 0; i < numEntities; i++) entities.push(buf.readUint32());
  let extra;
  if ("serializeExtra" in handler) extra = handler.deserializeExtra(buf);
  return { type, origPid, entities, extra };
}

// registerEventHandler("test", {
//   entities: [[PositionDef], [RotationDef]],
//   eventAuthorityEntity: ([posId, rotId]) => posId,
//   legalEvent: () => true,
//   runEvent: () => {
//     console.log("event running");
//   },
// });

function getEventAuthorityPid(event: DetectedEvent<unknown>): number {
  if (event.entities.length) {
    assert(
      EVENT_HANDLERS.has(event.type),
      `No event handler registered for event type ${event.type}`
    );
    const entId = EVENT_HANDLERS.get(event.type)!.eventAuthorityEntity(
      event.entities as any
    );
    const ent = EM.findEntity(entId, [AuthorityDef]);
    assert(ent && ent.authority, `missing .authority on event target ${entId}`);
    const { authority } = ent;
    return authority.pid;
  } else {
    return event.origPid;
  }
}

function legalEvent<Extra>(
  type: string,

  event: DetectedEvent<Extra>
) {
  if (!EVENT_HANDLERS.has(type))
    throw `No event handler registered for event type ${type}`;
  const handler = EVENT_HANDLERS.get(type)!;
  const entities = event.entities.map((id, idx) =>
    EM.findEntity(id, handler.entities[idx])
  );
  if (entities.some((e) => !e)) return false;
  return handler.legalEvent(entities as any, event.extra);
}

function runEvent<Extra>(type: string, event: Event<Extra>) {
  if (!EVENT_HANDLERS.has(type))
    throw `No event handler registered for event type ${type}`;
  const handler = EVENT_HANDLERS.get(type)!;
  const entities = event.entities.map((id, idx) => {
    const entity = EM.findEntity(id, [])!;
    for (const cdef of handler.entities[idx] as ComponentDef[]) {
      // TODO(@darzu): I'm a little nervous about this. We should only be calling
      // the constructor(), not the update(), and we need to assert that all the components
      // are updatable?
      if (!cdef.isOn(entity)) {
        // console.log(`runEvent setting ${cdef.name} on ${entity.id}`);
        EM.setOnce(entity, cdef);
      }
    }
    return entity;
  });
  return handler.runEvent(entities as any, event.extra);
}

const CHECK_EVENT_RAISE_ARGS = true;

export const DetectedEventsDef = EM.defineResource("detectedEvents", () => {
  const events = [] as DetectedEvent<any>[];
  return {
    events,
    raise: (e: DetectedEvent<any>) => {
      if (CHECK_EVENT_RAISE_ARGS) {
        assert(EVENT_HANDLERS.has(e.type), "raising event with no handlers");
        const handler = EVENT_HANDLERS.get(e.type)!;
        for (let idx = 0; idx < handler.entities.length; idx++) {
          const id = e.entities[idx];
          assert(EM.hasEntity(id), `raising event with non-exist entity ${id}`);
          const defs = handler.entities[idx] as ComponentDef[];
          const ent = EM.findEntity(id, defs);
          assert(
            !!ent,
            `raising event with entity ${id} which is missing one of these components: ${defs
              .map((d) => d.name)
              .join(",")}`
          );
        }
      }
      events.push(e);
    },
  };
});
export type DetectedEvents = Component<typeof DetectedEventsDef>;

// Outgoing event requests queue. Should be attached to the host
// peer, shouldn't exist at the host itself
export const OutgoingEventRequestsDef = EM.defineNonupdatableComponent(
  "outgoingEventRequests",
  (nextId?: number) => ({
    lastSendTime: 0,
    nextId: nextId || 0,
    events: [] as { id: number; event: DetectedEvent<any> }[],
  })
);

// Exists only at the host. This is a list of all events requested
// either by us or by another node
const RequestedEventsDef = EM.defineResource(
  "requestedEvents",
  () => [] as DetectedEvent<any>[]
);

// TODO: find a better name for this
// Attached to each peer by the event system at the host
const EventSyncDef = EM.defineComponent("eventSync", () => ({
  // The next unacked event ID from this peer
  nextId: 0,
  // The next event sequence number this peer should see
  nextSeq: 0,
  lastSendTime: 0,
}));

const EventsDef = EM.defineResource("events", () => ({
  log: [] as Event<any>[],
  last: -1,
  newEvents: false,
}));

// TODO: this function is bad and we should find a way to do without it
function takeEventsWithKnownObjects<Extra, E extends DetectedEvent<Extra>>(
  events: E[]
): E[] {
  const result = [];
  const remainingEvents = [];
  while (events.length > 0) {
    let event = events.shift()!;
    if (event.entities.every((id) => EM.hasEntity(id))) {
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

const EVENT_RETRANSMIT_MS = 100;

export function initNetGameEventSystems() {
  // Runs only at non-host, sends valid detected events as requests to host
  EM.addSystem(
    "detectedEventsToHost",
    Phase.NETWORK,
    [HostCompDef, OutboxDef], // TODO(@darzu): BUG! HostDef was in the components?
    [DetectedEventsDef, MeDef, TimeDef],
    (hosts, { detectedEvents, me, time }) => {
      if (hosts.length == 0) return;
      const host = hosts[0];
      EM.setOnce(host, OutgoingEventRequestsDef);
      let newEvents = false;
      while (detectedEvents.events.length > 0) {
        const event = detectedEvents.events.shift()!;
        const authorityPid = getEventAuthorityPid(event);
        if (authorityPid == me.pid) {
          // Gameplay code is responsible for ensuring events legal when generated
          assert(legalEvent(event.type, event), `illegal event ${event.type}`);
          newEvents = true;
          host.outgoingEventRequests.events.push({
            id: host.outgoingEventRequests.nextId++,
            event,
          });
        }
      }
      // We should send a message if we have new events to send or it's time to retransmit old events
      if (
        host.outgoingEventRequests.events.length > 0 &&
        (newEvents ||
          host.outgoingEventRequests.lastSendTime + EVENT_RETRANSMIT_MS <
            time.time)
      ) {
        console.log(
          `Sending ${host.outgoingEventRequests.events.length} event requests (newEvents=${newEvents}, lastSendTime=${host.outgoingEventRequests.lastSendTime}, time=${time.time}`
        );
        let message = new Serializer(MAX_MESSAGE_SIZE);
        message.writeUint8(MessageType.EventRequests);
        message.writeUint32(host.outgoingEventRequests.events[0].id);
        let numEvents = 0;
        let numEventsIndex = message.writeUint8(numEvents);
        try {
          for (let { event } of host.outgoingEventRequests.events) {
            serializeDetectedEvent(event, message);
            numEvents++;
          }
        } catch (e) {
          if (!(e instanceof OutOfRoomError)) throw e;
        }
        message.writeUint8(numEvents, numEventsIndex);
        send(host.outbox, message.buffer);
        host.outgoingEventRequests.lastSendTime = time.time;
      }
    }
  );

  // Runs only at host, handles incoming event requests
  EM.addSystem(
    "handleEventRequests",
    Phase.NETWORK,
    [InboxDef, OutboxDef],
    [HostDef],
    (inboxes) => {
      for (let { id, inbox, outbox } of inboxes) {
        let requestedEvents = EM.ensureResource(RequestedEventsDef);
        const eventRequestState = EM.ensureComponent(id, EventSyncDef);
        const eventRequests = inbox.get(MessageType.EventRequests) || [];
        let shouldSendAck = false;
        while (eventRequests.length > 0) {
          shouldSendAck = true;
          const message = eventRequests.shift()!;
          const firstId = message.readUint32();
          const numEvents = message.readUint8();
          if (eventRequestState.nextId < firstId) {
            throw `Got event request with ID ${firstId} > next ID ${eventRequestState.nextId}--this should never happen`;
          }
          // Do we actually need to process any of the events in this message?
          if (eventRequestState.nextId < firstId + numEvents) {
            let currentId;
            for (
              currentId = firstId;
              currentId < firstId + numEvents;
              currentId++
            ) {
              const detectedEvent = deserializeDetectedEvent(message);
              if (currentId >= eventRequestState.nextId) {
                if (legalEvent(detectedEvent.type, detectedEvent)) {
                  requestedEvents.push(detectedEvent);
                }
              }
            }
            eventRequestState.nextId = currentId;
          }
        }
        // Send ack message with next expected ID
        if (shouldSendAck) {
          let ack = new Serializer(8);
          ack.writeUint8(MessageType.AckEventRequests);
          ack.writeUint32(eventRequestState.nextId);
          send(outbox, ack.buffer);
        }
      }
    }
  );

  // Runs only at non-host, handles event request acks from host
  EM.addSystem(
    "handleEventRequestAcks",
    Phase.NETWORK,
    [InboxDef, OutgoingEventRequestsDef, HostCompDef], // TODO(@darzu): BUG!! This had HostDef as a component?!
    [],
    (hosts) => {
      if (hosts.length == 0) return;
      const { outgoingEventRequests, inbox } = hosts[0];
      const acks = inbox.get(MessageType.AckEventRequests) || [];
      while (acks.length > 0) {
        const message = acks.shift()!;
        const nextId = message.readUint32();
        // The host is acking all events with id < nextId
        while (
          outgoingEventRequests.events.length > 0 &&
          outgoingEventRequests.events[0].id < nextId
        ) {
          outgoingEventRequests.events.shift();
        }
      }
    }
  );

  // Runs only at host, converts events detected locally to event requests
  EM.addSystem(
    "detectedEventsToRequestedEvents",
    Phase.NETWORK,
    null,
    [DetectedEventsDef, HostDef, MeDef],
    ([], { detectedEvents, me }) => {
      const requestedEvents = EM.ensureResource(RequestedEventsDef);
      while (detectedEvents.events.length > 0) {
        const event = detectedEvents.events.shift()!;
        const authorityPid = getEventAuthorityPid(event);
        if (authorityPid == me.pid) {
          // Gameplay code is responsible for ensuring events legal when generated
          if (!legalEvent(event.type, event))
            throw `illegal event ${event.type}`;
          requestedEvents.push(event);
        }
      }
    }
  );

  // Runs only at host, runs legal events
  EM.addSystem(
    "requestedEventsToEvents",
    Phase.NETWORK,
    null,
    [RequestedEventsDef, EventsDef, HostDef],
    ([], { requestedEvents, events }) => {
      for (let detectedEvent of takeEventsWithKnownObjects(requestedEvents)) {
        if (legalEvent(detectedEvent.type, detectedEvent)) {
          let event = detectedEvent as Event<any>;
          event.seq = events.log.length;
          events.log.push(event);
          // run event immediately. TODO: is there a cleaner way to separate this out?
          runEvent(event.type, event);
          events.last = event.seq;
          events.newEvents = true;
        }
      }
    }
  );

  // runs only at host, sends events to other nodes
  EM.addSystem(
    "sendEvents",
    Phase.NETWORK,
    [OutboxDef],
    [EventsDef, HostDef, TimeDef],
    (peers, { events, time }) => {
      for (const { outbox, id } of peers) {
        let syncState = EM.ensureComponent(id, EventSyncDef);
        if (
          syncState.nextSeq <= events.last &&
          (events.newEvents ||
            syncState.lastSendTime + EVENT_RETRANSMIT_MS < time.time)
        ) {
          const log = events.log.slice(syncState.nextSeq);
          const message = new Serializer(MAX_MESSAGE_SIZE);
          message.writeUint8(MessageType.Events);
          message.writeUint32(log[0].seq);
          let numEvents = 0;
          let numEventsIndex = message.writeUint8(numEvents);
          try {
            for (let event of log) {
              serializeEvent(event, message);
              numEvents++;
            }
          } catch (e) {
            if (!(e instanceof OutOfRoomError)) throw e;
          }
          message.writeUint8(numEvents, numEventsIndex);
          send(outbox, message.buffer);
          syncState.lastSendTime = time.time;
        }
      }
      events.newEvents = false;
    }
  );

  // Runs only at non-host, handles events from host
  EM.addSystem(
    "handleEvents",
    Phase.NETWORK,
    [InboxDef, HostCompDef, OutboxDef], // TODO(@darzu): BUG!! This had HostDef as a component?!
    [EventsDef],
    (hosts, { events }) => {
      if (hosts.length === 0) return;
      const { inbox, outbox } = hosts[0];
      let shouldAck = false;
      while ((inbox.get(MessageType.Events) || []).length > 0) {
        shouldAck = true;
        const nextSeq = events.log.length;
        const message = inbox.get(MessageType.Events)!.shift()!;
        const firstSeq = message.readUint32();
        const numEvents = message.readUint8();
        if (firstSeq > nextSeq) {
          console.log("Got events from the future--disconnect and reconnect?");
          continue;
        }
        // Do we actually need to process any of the events in this message?
        if (nextSeq < firstSeq + numEvents) {
          let currentSeq;
          for (
            currentSeq = firstSeq;
            currentSeq < firstSeq + numEvents;
            currentSeq++
          ) {
            const event = deserializeEvent(message);
            if (currentSeq >= nextSeq) {
              if (event.seq !== events.log.length)
                throw `Oh no!! firstSeq=${firstSeq} currentSeq=${currentSeq} nextSeq=${nextSeq}`;
              events.log.push(event);
            }
          }
        }
      }
      if (shouldAck) {
        const message = new Serializer(8);
        message.writeUint8(MessageType.AckEvents);
        message.writeUint32(events.log.length);
        send(outbox, message.buffer);
      }
    }
  );

  // Runs only at host, handles event ACKs
  EM.addSystem(
    "handleEventAcks",
    Phase.NETWORK,
    [InboxDef],
    [HostDef],
    (inboxes) => {
      for (let { inbox, id } of inboxes) {
        const acks = inbox.get(MessageType.AckEvents) || [];
        const syncState = EM.ensureComponent(id, EventSyncDef);
        while (acks.length > 0) {
          const message = acks.shift()!;
          const nextSeq = message.readUint32();
          console.log(`Acked @ ${nextSeq}`);
          syncState.nextSeq = Math.max(syncState.nextSeq, nextSeq);
        }
      }
    }
  );

  // TODO: this probably doesn't need to run at the host (it should always no-op there)
  function runEvents(
    [],
    { events }: { events: { last: number; log: Event<any>[] } }
  ) {
    const newEvents = events.log.slice(events.last + 1);
    if (newEvents.length > 0) {
      for (let event of newEvents) {
        // If we don't know about all of these objects, we're not ready to run
        // this event (or subsequent events)
        if (!event.entities.every((id) => EM.hasEntity(id))) break;
        runEvent(event.type, event);
        events.last = event.seq;
      }
    }
  }

  EM.addSystem("runEvents", Phase.NETWORK, null, [EventsDef], runEvents);
}

export function addEventComponents() {
  EM.addResource(DetectedEventsDef);
  EM.addResource(EventsDef);
}

export function eventWizard<ES extends EDef<any>[], Extra>(
  name: string,
  entities: readonly [...ES] | (() => readonly [...ES]),
  runEvent: (entities: ESet<ES>, extra: Extra) => void,
  opts?: {
    legalEvent?: (entities: ESet<ES>, extra: Extra) => boolean;
    eventAuthorityEntity?: (entityIds: NumberTuple<ES>) => number;
  } & Partial<ExtraSerializers<Extra>>
): (...es: [...ESet<ES>, Extra?]) => void {
  const delayInit = typeof entities === "function";
  const initThunk = () => {
    registerEventHandler<ES, Extra>(name, {
      entities: delayInit ? entities() : entities,
      eventAuthorityEntity: (es) => {
        if (opts?.eventAuthorityEntity) return opts.eventAuthorityEntity(es);
        else return es[0];
      },
      legalEvent: (es, extra) => {
        if (opts?.legalEvent) return opts.legalEvent(es, extra);
        return true;
      },
      runEvent: (es, extra) => {
        runEvent(es, extra);
      },
      ...(opts?.serializeExtra ? { serializeExtra: opts.serializeExtra } : {}),
      ...(opts?.deserializeExtra
        ? { deserializeExtra: opts.deserializeExtra }
        : {}),
    });
  };

  if (delayInit) {
    setTimeout(initThunk, 0);
  } else initThunk();

  const raiseEvent = (...args: [...ESet<ES>, Extra?]) => {
    const query = delayInit ? entities() : entities;
    let es: ESet<ES>;
    let extra: Extra | undefined = undefined;
    if (args.length === query.length) es = args as any;
    else {
      es = args.slice(0, args.length - 1) as any;
      extra = args[args.length - 1] as Extra;
    }
    const de = EM.getResource(DetectedEventsDef)!;
    const me = EM.getResource(MeDef)!;
    de.raise({
      type: name,
      origPid: me.pid,
      entities: es.map((e) => e.id),
      extra,
    });
  };
  return raiseEvent;
}
