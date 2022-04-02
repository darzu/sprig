import { EM } from "../entity-manager.js";
import { Serializer, OutOfRoomError } from "../serialize.js";
import { MAX_MESSAGE_SIZE, MessageType } from "./message.js";
import { MeDef, OutboxDef, send, HostDef, InboxDef, AuthorityDef, } from "./components.js";
import { hashCode } from "../util.js";
import { TimeDef } from "../time.js";
const EVENT_TYPES = new Map();
function serializeEvent(event, buf) {
    buf.writeUint32(hashCode(event.type));
    buf.writeUint32(event.seq);
    buf.writeUint8(event.entities.length);
    for (const id of event.entities)
        buf.writeUint32(id);
    if (event.location) {
        buf.writeUint8(1);
        buf.writeVec3(event.location);
    }
    else {
        buf.writeUint8(0);
    }
}
function deserializeEvent(buf) {
    let typeCode = buf.readUint32();
    if (!EVENT_TYPES.has(typeCode)) {
        throw `Tried to deserialize unrecognized event type ${typeCode}`;
    }
    const type = EVENT_TYPES.get(typeCode);
    const seq = buf.readUint32();
    const entities = [];
    const numEntities = buf.readUint8();
    for (let i = 0; i < numEntities; i++)
        entities.push(buf.readUint32());
    const hasLocation = buf.readUint8();
    const location = hasLocation ? buf.readVec3() : null;
    return { type, seq, entities, location };
}
function serializeDetectedEvent(event, buf) {
    buf.writeUint32(hashCode(event.type));
    buf.writeUint8(event.entities.length);
    for (const id of event.entities)
        buf.writeUint32(id);
    if (event.location) {
        buf.writeUint8(1);
        buf.writeVec3(event.location);
    }
    else {
        buf.writeUint8(0);
    }
}
function deserializeDetectedEvent(buf) {
    let typeCode = buf.readUint32();
    if (!EVENT_TYPES.has(typeCode)) {
        throw `Tried to deserialize unrecognized event type ${typeCode}`;
    }
    const type = EVENT_TYPES.get(typeCode);
    const entities = [];
    const numEntities = buf.readUint8();
    for (let i = 0; i < numEntities; i++)
        entities.push(buf.readUint32());
    const hasLocation = buf.readUint8();
    const location = hasLocation ? buf.readVec3() : null;
    return { type, entities, location };
}
const EVENT_HANDLERS = new Map();
export function registerEventHandler(type, handler) {
    EVENT_TYPES.set(hashCode(type), type);
    EVENT_HANDLERS.set(type, handler);
}
registerEventHandler("test", {
    eventAuthorityEntity: (l) => l[0],
    legalEvent: () => true,
    runEvent: () => {
        console.log("event running");
    },
});
function eventAuthorityEntity(type, entities) {
    if (!EVENT_HANDLERS.has(type))
        throw `No event handler registered for event type ${type}`;
    return EVENT_HANDLERS.get(type).eventAuthorityEntity(entities);
}
function legalEvent(type, em, event) {
    if (!EVENT_HANDLERS.has(type))
        throw `No event handler registered for event type ${type}`;
    return EVENT_HANDLERS.get(type).legalEvent(em, event.entities);
}
function runEvent(type, em, event) {
    if (!EVENT_HANDLERS.has(type))
        throw `No event handler registered for event type ${type}`;
    return EVENT_HANDLERS.get(type).runEvent(em, event.entities, event.location);
}
export const DetectedEventsDef = EM.defineComponent("detectedEvents", () => []);
// Outgoing event requests queue. Should be attached to the host
// peer, shouldn't exist at the host itself
export const OutgoingEventRequestsDef = EM.defineComponent("outgoingEventRequests", (nextId) => ({
    lastSendTime: 0,
    nextId: nextId || 0,
    events: [],
}));
// Exists only at the host. This is a list of all events requested
// either by us or by another node
const RequestedEventsDef = EM.defineComponent("requestedEvents", () => []);
// TODO: find a better name for this
// Attached to each peer by the event system at the host
const EventSyncDef = EM.defineComponent("eventSync", () => ({
    // The next unacked event ID from this peer
    nextId: 0,
    // The next event sequence number this peer should see
    nextSeq: 0,
    lastSendTime: 0,
}));
const EventsDef = EM.defineComponent("events", () => ({
    log: [],
    last: -1,
    newEvents: false,
}));
// TODO: this function is bad and we should find a way to do without it
function takeEventsWithKnownObjects(em, events) {
    const result = [];
    const remainingEvents = [];
    while (events.length > 0) {
        let event = events.shift();
        if (event.entities.every((id) => em.hasEntity(id))) {
            result.push(event);
        }
        else {
            remainingEvents.push(event);
        }
    }
    while (remainingEvents.length > 0) {
        events.push(remainingEvents.shift());
    }
    return result;
}
const EVENT_RETRANSMIT_MS = 100;
export function registerEventSystems(em) {
    // Runs only at non-host, sends valid detected events as requests to host
    em.registerSystem([HostDef, OutboxDef], [DetectedEventsDef, MeDef, TimeDef], (hosts, { detectedEvents, me, time }) => {
        if (hosts.length == 0)
            return;
        const host = hosts[0];
        const outgoingEventRequests = em.ensureComponent(host.id, OutgoingEventRequestsDef);
        let newEvents = false;
        while (detectedEvents.length > 0) {
            const event = detectedEvents.shift();
            const authorityId = eventAuthorityEntity(event.type, event.entities);
            const { authority } = em.findEntity(authorityId, [AuthorityDef]);
            if (authority.pid == me.pid) {
                // Gameplay code is responsible for ensuring events legal when generated
                if (!legalEvent(event.type, em, event))
                    throw `illegal event ${event.type}`;
                newEvents = true;
                outgoingEventRequests.events.push({
                    id: outgoingEventRequests.nextId++,
                    event,
                });
            }
        }
        // We should send a message if we have new events to send or it's time to retransmit old events
        if (outgoingEventRequests.events.length > 0 &&
            (newEvents ||
                outgoingEventRequests.lastSendTime + EVENT_RETRANSMIT_MS < time.time)) {
            console.log(`Sending ${outgoingEventRequests.events.length} event requests (newEvents=${newEvents}, lastSendTime=${outgoingEventRequests.lastSendTime}, time=${time.time}`);
            let message = new Serializer(MAX_MESSAGE_SIZE);
            message.writeUint8(MessageType.EventRequests);
            message.writeUint32(outgoingEventRequests.events[0].id);
            let numEvents = 0;
            let numEventsIndex = message.writeUint8(numEvents);
            try {
                for (let { event } of outgoingEventRequests.events) {
                    serializeDetectedEvent(event, message);
                    numEvents++;
                }
            }
            catch (e) {
                if (!(e instanceof OutOfRoomError))
                    throw e;
            }
            message.writeUint8(numEvents, numEventsIndex);
            send(host.outbox, message.buffer);
            outgoingEventRequests.lastSendTime = time.time;
        }
    }, "detectedEventsToHost");
    // Runs only at host, handles incoming event requests
    em.registerSystem([InboxDef, OutboxDef], [HostDef], (inboxes) => {
        for (let { id, inbox, outbox } of inboxes) {
            let requestedEvents = em.ensureSingletonComponent(RequestedEventsDef);
            const eventRequestState = em.ensureComponent(id, EventSyncDef);
            const eventRequests = inbox.get(MessageType.EventRequests) || [];
            let shouldSendAck = false;
            while (eventRequests.length > 0) {
                shouldSendAck = true;
                const message = eventRequests.shift();
                const firstId = message.readUint32();
                const numEvents = message.readUint8();
                if (eventRequestState.nextId < firstId) {
                    throw `Got event request with ID ${firstId} > next ID ${eventRequestState.nextId}--this should never happen`;
                }
                // Do we actually need to process any of the events in this message?
                if (eventRequestState.nextId < firstId + numEvents) {
                    let currentId;
                    for (currentId = firstId; currentId < firstId + numEvents; currentId++) {
                        const detectedEvent = deserializeDetectedEvent(message);
                        if (currentId >= eventRequestState.nextId) {
                            if (legalEvent(detectedEvent.type, em, detectedEvent)) {
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
    }, "handleEventRequests");
    // Runs only at non-host, handles event request acks from host
    em.registerSystem([InboxDef, OutgoingEventRequestsDef, HostDef], [], (hosts) => {
        if (hosts.length == 0)
            return;
        const { outgoingEventRequests, inbox } = hosts[0];
        const acks = inbox.get(MessageType.AckEventRequests) || [];
        while (acks.length > 0) {
            const message = acks.shift();
            const nextId = message.readUint32();
            // The host is acking all events with id < nextId
            while (outgoingEventRequests.events.length > 0 &&
                outgoingEventRequests.events[0].id < nextId) {
                outgoingEventRequests.events.shift();
            }
        }
    }, "handleEventRequestAcks");
    // Runs only at host, converts events detected locally to event requests
    em.registerSystem(null, [DetectedEventsDef, HostDef, MeDef], ([], { detectedEvents, me }) => {
        const requestedEvents = em.ensureSingletonComponent(RequestedEventsDef);
        while (detectedEvents.length > 0) {
            const event = detectedEvents.shift();
            const authorityId = eventAuthorityEntity(event.type, event.entities);
            const { authority } = em.findEntity(authorityId, [AuthorityDef]);
            if (authority.pid == me.pid) {
                // Gameplay code is responsible for ensuring events legal when generated
                if (!legalEvent(event.type, em, event))
                    throw `illegal event ${event.type}`;
                requestedEvents.push(event);
            }
        }
    }, "detectedEventsToRequestedEvents");
    // Runs only at host, runs legal events
    em.registerSystem(null, [RequestedEventsDef, EventsDef, HostDef], ([], { requestedEvents, events }) => {
        for (let detectedEvent of takeEventsWithKnownObjects(em, requestedEvents)) {
            if (legalEvent(detectedEvent.type, em, detectedEvent)) {
                let event = detectedEvent;
                event.seq = events.log.length;
                events.log.push(event);
                // run event immediately. TODO: is there a cleaner way to separate this out?
                runEvent(event.type, em, event);
                events.last = event.seq;
                events.newEvents = true;
            }
        }
    }, "requestedEventsToEvents");
    // runs only at host, sends events to other nodes
    em.registerSystem([OutboxDef], [EventsDef, HostDef, TimeDef], (peers, { events, time }) => {
        for (const { outbox, id } of peers) {
            let syncState = em.ensureComponent(id, EventSyncDef);
            if (syncState.nextSeq <= events.last &&
                (events.newEvents ||
                    syncState.lastSendTime + EVENT_RETRANSMIT_MS < time.time)) {
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
                }
                catch (e) {
                    if (!(e instanceof OutOfRoomError))
                        throw e;
                }
                message.writeUint8(numEvents, numEventsIndex);
                send(outbox, message.buffer);
                syncState.lastSendTime = time.time;
            }
        }
        events.newEvents = false;
    }, "sendEvents");
    // Runs only at non-host, handles events from host
    em.registerSystem([InboxDef, HostDef, OutboxDef], [EventsDef], (hosts, { events }) => {
        if (hosts.length === 0)
            return;
        const { inbox, outbox } = hosts[0];
        let shouldAck = false;
        while ((inbox.get(MessageType.Events) || []).length > 0) {
            shouldAck = true;
            const nextSeq = events.log.length;
            const message = inbox.get(MessageType.Events).shift();
            const firstSeq = message.readUint32();
            const numEvents = message.readUint8();
            if (firstSeq > nextSeq) {
                console.log("Got events from the future--disconnect and reconnect?");
                continue;
            }
            // Do we actually need to process any of the events in this message?
            if (nextSeq < firstSeq + numEvents) {
                let currentSeq;
                for (currentSeq = firstSeq; currentSeq < firstSeq + numEvents; currentSeq++) {
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
    }, "handleEvents");
    // Runs only at host, handles event ACKs
    em.registerSystem([InboxDef], [HostDef], (inboxes) => {
        for (let { inbox, id } of inboxes) {
            const acks = inbox.get(MessageType.AckEvents) || [];
            const syncState = em.ensureComponent(id, EventSyncDef);
            while (acks.length > 0) {
                const message = acks.shift();
                const nextSeq = message.readUint32();
                console.log(`Acked @ ${nextSeq}`);
                syncState.nextSeq = Math.max(syncState.nextSeq, nextSeq);
            }
        }
    }, "handleEventAcks");
    // TODO: this probably doesn't need to run at the host (it should always no-op there)
    function runEvents([], { events }) {
        const newEvents = events.log.slice(events.last + 1);
        if (newEvents.length > 0) {
            for (let event of newEvents) {
                // If we don't know about all of these objects, we're not ready to run
                // this event (or subsequent events)
                if (!event.entities.every((id) => em.hasEntity(id)))
                    break;
                runEvent(event.type, em, event);
                events.last = event.seq;
            }
        }
    }
    em.registerSystem(null, [EventsDef], runEvents);
}
export function addEventComponents(em) {
    em.addSingletonComponent(DetectedEventsDef);
    em.addSingletonComponent(EventsDef);
}
//# sourceMappingURL=events.js.map