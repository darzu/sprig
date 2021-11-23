import { Peer } from "./peer.js";
import { Serializer, Deserializer, OutOfRoomError } from "./serialize.js";
// fraction of state updates to artificially drop
const DROP_PROBABILITY = 0.1;
const DELAY_SENDS = false;
const SEND_DELAY = 500.0;
const SEND_DELAY_JITTER = 10.0;
const MAX_MESSAGE_SIZE = 1000;
// weight of existing skew measurement vs. new skew measurement
const SKEW_WEIGHT = 0.5;
var MessageType;
(function (MessageType) {
    // Join a game in progress
    MessageType[MessageType["Join"] = 0] = "Join";
    MessageType[MessageType["JoinResponse"] = 1] = "JoinResponse";
    // State update
    MessageType[MessageType["Event"] = 2] = "Event";
    MessageType[MessageType["EventRequest"] = 3] = "EventRequest";
    MessageType[MessageType["StateUpdate"] = 4] = "StateUpdate";
    MessageType[MessageType["StateUpdateResponse"] = 5] = "StateUpdateResponse";
    // Reserve unique object IDs
    MessageType[MessageType["ReserveIDs"] = 6] = "ReserveIDs";
    MessageType[MessageType["ReserveIDsResponse"] = 7] = "ReserveIDsResponse";
    // Estimate clock skew
    MessageType[MessageType["Ping"] = 8] = "Ping";
    MessageType[MessageType["Pong"] = 9] = "Pong";
})(MessageType || (MessageType = {}));
var ObjectUpdateType;
(function (ObjectUpdateType) {
    ObjectUpdateType[ObjectUpdateType["Full"] = 0] = "Full";
    ObjectUpdateType[ObjectUpdateType["Dynamic"] = 1] = "Dynamic";
    ObjectUpdateType[ObjectUpdateType["Create"] = 2] = "Create";
    ObjectUpdateType[ObjectUpdateType["Delta"] = 3] = "Delta";
})(ObjectUpdateType || (ObjectUpdateType = {}));
// target length for jitter buffer
const BUFFER_TARGET = 3;
function writeEvent(message, event) {
    message.writeUint32(event.id);
    message.writeUint8(event.type);
    message.writeUint8(event.authority);
    message.writeUint8(event.objects.length);
    for (let id of event.objects) {
        message.writeUint32(id);
    }
    if (event.location) {
        message.writeUint8(1);
        message.writeVec3(event.location);
    }
    else {
        message.writeUint8(0);
    }
}
function readEvent(message) {
    let id = message.readUint32();
    let type = message.readUint8();
    let authority = message.readUint8();
    let numObjectsInEvent = message.readUint8();
    let objects = [];
    for (let i = 0; i < numObjectsInEvent; i++) {
        objects.push(message.readUint32());
    }
    let location = null;
    if (message.readUint8()) {
        location = message.readVec3();
    }
    return { id, type, objects, authority, location };
}
// Responsible for sync-ing objects to a *particular* other server.
class StateSynchronizer {
    constructor(net, remoteId) {
        this.updateSeq = 0;
        this.objectPriorities = {};
        this.objectsKnown = new Set();
        this.objectsInUpdate = {};
        this.eventIndex = 0;
        this.net = net;
        this.remoteId = remoteId;
    }
    objects() {
        // TODO: there's gotta be a way to do this faster than O(N log N) in the
        // number of objects.  Could maybe use priority queues? with an efficient
        // heap can get amortized O(1) on key-increase ops, so setting the priorities should be O(N).
        // Then we're removing a constant # of items, so removing should be O(log N) overall?
        // Could also cache this sorted list--order will stay mostly the same so with a sort that's
        // optimized for mostly-ordered data (like TimSort) the sort should be O(N)
        let allObjects = this.net.state.allObjects();
        allObjects = allObjects.filter((obj) => (!obj.deleted && obj.authority == this.net.state.me) ||
            (obj.creator == this.net.state.me && !this.objectsKnown.has(obj.id)));
        for (let obj of allObjects) {
            let priorityIncrease;
            priorityIncrease = obj.syncPriority(!this.objectsKnown.has(obj.id));
            if (!this.objectsKnown.has(obj.id)) {
                // try to sync new objects
                priorityIncrease += 1000;
            }
            if (!this.objectPriorities[obj.id]) {
                this.objectPriorities[obj.id] = priorityIncrease;
            }
            else {
                this.objectPriorities[obj.id] += priorityIncrease;
            }
        }
        // We always want objects that this remote peer might not know
        // about to come first. After that, we want objects sorted in priority order.
        allObjects.sort((o1, o2) => {
            return this.objectPriorities[o2.id] - this.objectPriorities[o1.id];
        });
        return allObjects;
    }
    sendEvents() {
        while (this.eventIndex < this.net.eventLog.length) {
            let message = new Serializer(MAX_MESSAGE_SIZE);
            message.writeUint8(MessageType.Event);
            message.writeUint32(this.eventIndex);
            writeEvent(message, this.net.eventLog[this.eventIndex]);
            this.net.send(this.remoteId, message.buffer, true);
            this.eventIndex++;
        }
    }
    update() {
        //console.log("update() called");
        let message = new Serializer(MAX_MESSAGE_SIZE);
        let seq = this.updateSeq++;
        message.writeUint8(MessageType.StateUpdate);
        message.writeUint32(seq);
        message.writeFloat32(performance.now());
        let objects = this.objects();
        let numObjects = 0;
        let numObjectsIndex = message.writeUint8(numObjects);
        try {
            // events always get synced before objects
            for (let obj of objects) {
                //console.log(`Trying to sync object ${obj.id}`);
                // TODO: could this be a 16-bit integer instead?
                message.writeUint32(obj.id);
                if (this.objectsKnown.has(obj.id)) {
                    // do a dynamic update
                    message.writeUint8(ObjectUpdateType.Dynamic);
                    message.writeUint8(obj.authority);
                    message.writeUint32(obj.authority_seq);
                    obj.serializeDynamic(message);
                }
                else {
                    // need to do a full sync
                    if (obj.authority !== this.net.state.me) {
                        message.writeUint8(ObjectUpdateType.Create);
                    }
                    else {
                        message.writeUint8(ObjectUpdateType.Full);
                    }
                    message.writeUint8(obj.authority);
                    message.writeUint32(obj.authority_seq);
                    message.writeUint8(obj.typeId());
                    message.writeUint8(obj.creator);
                    obj.serializeFull(message);
                    if (!this.objectsInUpdate[seq]) {
                        this.objectsInUpdate[seq] = new Set();
                    }
                    this.objectsInUpdate[seq].add(obj.id);
                }
                this.objectPriorities[obj.id] = 0;
                numObjects++;
            }
        }
        catch (e) {
            if (!(e instanceof OutOfRoomError))
                throw e;
        }
        //console.log(`Update includes ${numObjects} objects`);
        message.writeUint8(numObjects, numObjectsIndex);
        this.net.send(this.remoteId, message.buffer, false);
    }
    ackUpdate(seq) {
        //console.log(`${seq} acked`);
        let ids = this.objectsInUpdate[seq];
        if (!ids)
            return;
        ids.forEach((id) => {
            //console.log(`${id} known`);
            //console.log(`Object ${id} is known`);
            this.objectsKnown.add(id);
        });
        // TODO: should probably GC old unacked messages as well to avoid unbounded
        // memory growth
        delete this.objectsInUpdate[seq];
    }
}
export class Net {
    constructor(state, host, ready) {
        this.me = "";
        this.peers = [];
        this.reliableChannels = {};
        this.unreliableChannels = {};
        this.stateUpdates = {};
        this.eventLog = [];
        this.eventRequests = [];
        this.events = [];
        this.synchronizers = {};
        this.numDroppedUpdates = 0;
        this.pingSeq = 0;
        this.pingTime = 0;
        this.skewEstimate = {};
        this.pingEstimate = {};
        this.state = state;
        this.ready = ready;
        // ping all servers once per second to estimate clock skew
        setInterval(() => this.ping(), 1000);
        if (host === null) {
            // we're the host, just start up
            this.host = true;
            this.peer = new Peer();
            this.peer.onopen = (id) => {
                this.awaitConnections();
                this.ready(id);
            };
        }
        else {
            // we need to connect to another host
            this.host = false;
            this.peers = [host];
            this.peer = new Peer();
            this.peer.onopen = () => {
                this.awaitConnections();
                this.peer.connect(host, true).then((reliableChannel) => {
                    this.peer.connect(host, false).then((unreliableChannel) => {
                        this.reliableChannels[host] = reliableChannel;
                        this.unreliableChannels[host] = unreliableChannel;
                        this.setupChannel(host, reliableChannel);
                        this.setupChannel(host, unreliableChannel);
                        let message = new Serializer(4);
                        message.writeUint8(MessageType.Join);
                        this.send(host, message.buffer, true);
                        this.synchronizers[host] = new StateSynchronizer(this, host);
                    });
                });
            };
        }
    }
    send(server, message, reliable) {
        // TODO: figure out if we need to do something smarter than just not sending if the connection isn't present
        let conn = reliable
            ? this.reliableChannels[server]
            : this.unreliableChannels[server];
        if (conn && conn.readyState === "open") {
            if (DELAY_SENDS) {
                if (reliable || Math.random() > DROP_PROBABILITY) {
                    setTimeout(() => conn.send(message), SEND_DELAY + SEND_DELAY_JITTER * Math.random());
                }
            }
            else {
                conn.send(message);
            }
        }
    }
    stats() {
        let reliableBufferSize = 0;
        for (let chan of Object.values(this.reliableChannels)) {
            reliableBufferSize += chan.bufferedAmount;
        }
        let unreliableBufferSize = 0;
        for (let chan of Object.values(this.unreliableChannels)) {
            unreliableBufferSize += chan.bufferedAmount;
        }
        return {
            reliableBufferSize,
            unreliableBufferSize,
            numDroppedUpdates: this.numDroppedUpdates,
            skew: Object.values(this.skewEstimate),
            ping: Object.values(this.pingEstimate),
        };
    }
    ping() {
        this.pingSeq++;
        let seq = this.pingSeq;
        let time = performance.now();
        this.pingTime = time;
        let message = new Serializer(5);
        message.writeUint8(MessageType.Ping);
        message.writeUint32(seq);
        for (let server of this.peers) {
            this.send(server, message.buffer, false);
        }
    }
    setupChannel(server, chan) {
        chan.onmessage = async (ev) => {
            const buff = ev.data.arrayBuffer
                ? await ev.data.arrayBuffer()
                : ev.data;
            this.handleMessage(server, buff);
        };
    }
    handleMessage(server, data) {
        let deserializer = new Deserializer(data);
        let type = deserializer.readUint8();
        //console.log(`Received message of type ${MessageType[type]}`);
        switch (type) {
            case MessageType.Join: {
                // no other data associated with a join message
                let [id, _playerObj] = this.state.addPlayer();
                let response = new Serializer(MAX_MESSAGE_SIZE);
                response.writeUint8(MessageType.JoinResponse);
                response.writeUint8(id);
                response.writeUint8(this.peers.length);
                for (let peer of this.peers) {
                    response.writeString(peer);
                }
                this.send(server, response.buffer, true);
                this.peers.push(server);
                this.synchronizers[server] = new StateSynchronizer(this, server);
                break;
            }
            case MessageType.JoinResponse: {
                this.state.me = deserializer.readUint8();
                // TODO: this is a hack, need to actually have some system for reserving
                // object ids at each node
                this.state.nextObjectId = this.state.me * 10000;
                let npeers = deserializer.readUint8();
                for (let i = 0; i < npeers; i++) {
                    let peer = deserializer.readString();
                    this.connectTo(peer);
                }
                this.ready(this.me);
                break;
            }
            case MessageType.StateUpdate: {
                // don't apply this update yet--buffer it for the next time we're ready
                // for updates
                if (!this.stateUpdates[server]) {
                    this.stateUpdates[server] = [];
                }
                let seq = deserializer.readUint32();
                let i = 0;
                while (i < this.stateUpdates[server].length) {
                    if (seq < this.stateUpdates[server][i].seq) {
                        break;
                    }
                    i++;
                }
                this.stateUpdates[server].splice(i, 0, { seq, data });
                break;
            }
            case MessageType.Event: {
                this.events.push(data);
                break;
            }
            case MessageType.EventRequest: {
                this.eventRequests.push(data);
                break;
            }
            case MessageType.StateUpdateResponse: {
                let seq = deserializer.readUint32();
                this.synchronizers[server].ackUpdate(seq);
                break;
            }
            case MessageType.Ping: {
                let seq = deserializer.readUint32();
                let resp = new Serializer(9);
                resp.writeUint8(MessageType.Pong);
                resp.writeUint32(seq);
                resp.writeFloat32(performance.now());
                this.send(server, resp.buffer, false);
                break;
            }
            case MessageType.Pong: {
                let time = performance.now();
                let seq = deserializer.readUint32();
                let remoteTime = deserializer.readFloat32();
                // only want to handle this if it's in response to our latest ping
                if (seq !== this.pingSeq) {
                    break;
                }
                let rtt = time - this.pingTime;
                let skew = remoteTime - (this.pingTime + rtt / 2);
                if (!this.skewEstimate[server]) {
                    this.skewEstimate[server] = skew;
                    this.pingEstimate[server] = rtt / 2;
                }
                else {
                    this.skewEstimate[server] =
                        SKEW_WEIGHT * this.skewEstimate[server] + (1 - SKEW_WEIGHT) * skew;
                    this.pingEstimate[server] =
                        SKEW_WEIGHT * this.pingEstimate[server] +
                            (1 - SKEW_WEIGHT) * (rtt / 2);
                }
            }
        }
    }
    sendEvents() {
        for (let synchronizer of Object.values(this.synchronizers)) {
            synchronizer.sendEvents();
        }
    }
    sendStateUpdates() {
        for (let synchronizer of Object.values(this.synchronizers)) {
            synchronizer.update();
        }
    }
    applyStateUpdate(data, atTime) {
        //console.log("In applyStateUpdate");
        //console.log("Applying state update");
        let applied = true;
        let message = new Deserializer(data);
        let type = message.readUint8();
        if (type !== MessageType.StateUpdate)
            throw "Wacky message type in applyStateUpdate";
        let seq = message.readUint32();
        let ts = message.readFloat32();
        let dt = atTime - ts;
        let numObjects = message.readUint8();
        for (let i = 0; i < numObjects; i++) {
            // make sure we're not in dummy mode
            message.dummy = false;
            let id = message.readUint32();
            //console.log(`State update for ${id}`);
            let updateType = message.readUint8();
            if (updateType === ObjectUpdateType.Full ||
                updateType === ObjectUpdateType.Create) {
                //console.log(`Full state update for ${id}`);
                let authority = message.readUint8();
                let authority_seq = message.readUint32();
                let typeId = message.readUint8();
                let creator = message.readUint8();
                let obj = this.state.getObject(id);
                let objExisted = !!obj;
                if (!obj) {
                    obj = this.state.objectOfType(typeId, id, creator);
                }
                // Don't update an existing object if this was a create message or the authority claim is old
                if ((objExisted && updateType === ObjectUpdateType.Create) ||
                    !obj.claimAuthority(authority, authority_seq, seq)) {
                    message.dummy = true;
                }
                obj.deserializeFull(message);
                if (!message.dummy && dt > 0) {
                    obj.simulate(dt);
                }
                if (!objExisted) {
                    this.state.addObject(obj);
                }
            }
            else if (updateType === ObjectUpdateType.Dynamic) {
                //console.log("Dynamic state update");
                let authority = message.readUint8();
                let authority_seq = message.readUint32();
                let obj = this.state.getObject(id);
                if (!obj) {
                    throw "Got non-full update for unknown object ${id}";
                }
                if (!obj.claimAuthority(authority, authority_seq, seq)) {
                    message.dummy = true;
                }
                obj.deserializeDynamic(message);
                if (!message.dummy && dt > 0) {
                    if (seq % 20 == 0) {
                        //console.log(`simulating forward ${dt}ms`);
                    }
                    obj.simulate(dt);
                }
            }
            else {
                throw `Unsupported update type ${updateType} in applyStateUpdate`;
            }
        }
        return applied;
    }
    handleEventRequests() {
        // hosts immediately process events, other nodes send requests
        while (this.state.requestedEvents.length != 0) {
            let event = this.state.requestedEvents.shift();
            if (this.host) {
                this.eventLog.push(event);
                this.state.runEvent(event);
            }
            else {
                let message = new Serializer(MAX_MESSAGE_SIZE);
                message.writeUint8(MessageType.EventRequest);
                writeEvent(message, event);
                this.send(this.peers[0], message.buffer, true);
            }
        }
        // process incoming event requests
        if (this.host) {
            let eventRequestsToRetry = [];
            while (this.eventRequests.length != 0) {
                let data = this.eventRequests.shift();
                let message = new Deserializer(data);
                let type = message.readUint8();
                if (type !== MessageType.EventRequest)
                    throw "Wacky message type in handleEventRequests";
                let event = readEvent(message);
                if (!this.haveAllObjects(event)) {
                    // We're not ready to handle this event request; try again next frame
                    eventRequestsToRetry.push(data);
                }
                else if (this.state.legalEvent(event)) {
                    // This event is consistent with the state, so apply it
                    this.applyEvent(event);
                }
                // Otherwise, we have the objects in the event but it isn't
                // consistent. drop it on the floor. This is a normal occurrence--for
                // instance, it will happen on an object-pickup event if another player
                // picked up the object in the interim.
            }
            this.eventRequests = eventRequestsToRetry;
            this.sendEvents();
        }
    }
    haveAllObjects(event) {
        return event.objects.every((id) => !!this.state.getObject(id));
    }
    applyEvent(event) {
        this.eventLog.push(event);
        this.state.runEvent(event);
    }
    applyEventFromServer(data) {
        let message = new Deserializer(data);
        let messageType = message.readUint8();
        let index = message.readUint32();
        if (messageType !== MessageType.Event)
            throw "Wacky message type in applyEventFromServer";
        if (index < this.eventLog.length) {
            // we've already processed this event
            return true;
        }
        if (index > this.eventLog.length) {
            // we're not ready to process this event
            return false;
        }
        let event = readEvent(message);
        // do we know about all of these object ids?
        if (!this.haveAllObjects(event)) {
            return false;
        }
        this.applyEvent(event);
        return true;
    }
    updateState(atTime) {
        //console.log("In updateState");
        while (this.events.length > 0) {
            let data = this.events.shift();
            if (!this.applyEventFromServer(data)) {
                this.events.unshift(data);
                break;
            }
        }
        for (let server of this.peers) {
            // console.log(
            //   `Have ${
            //     this.stateUpdates[server] ? this.stateUpdates[server].length : 0
            //   } buffered state updates`
            // );
            //console.log(`Looking for update ${this.nextUpdate[server]}`);
            while (this.stateUpdates[server] &&
                this.stateUpdates[server].length > 0) {
                let { seq, data } = this.stateUpdates[server].shift();
                //console.log(`Applying ${seq}`);
                let applied = this.applyStateUpdate(data, atTime + (this.skewEstimate[server] || 0));
                if (applied) {
                    let ack = new Serializer(8);
                    ack.writeUint8(MessageType.StateUpdateResponse);
                    //console.log(`Acking ${seq}`);
                    ack.writeUint32(seq);
                    this.send(server, ack.buffer, false);
                }
            }
        }
    }
    // listen for incoming connections
    awaitConnections() {
        this.peer.onconnection = (server, channel) => {
            let reliable = channel.maxRetransmits === null || channel.maxRetransmits > 0;
            //console.log(`Connection from ${server} with reliable: ${reliable}`);
            if (reliable) {
                this.reliableChannels[server] = channel;
            }
            else {
                this.unreliableChannels[server] = channel;
            }
            if (this.reliableChannels[server] &&
                this.unreliableChannels[server] &&
                !this.host) {
                this.peers.push(server);
                this.synchronizers[server] = new StateSynchronizer(this, server);
            }
            this.setupChannel(server, channel);
        };
    }
    connectTo(server) {
        //console.log(`connecting to ${server}`);
        this.peer.connect(server, true).then((reliableChannel) => {
            this.peer.connect(server, false).then((unreliableChannel) => {
                this.reliableChannels[server] = reliableChannel;
                this.unreliableChannels[server] = unreliableChannel;
                this.setupChannel(server, reliableChannel);
                this.setupChannel(server, unreliableChannel);
                this.peers.push(server);
                this.synchronizers[server] = new StateSynchronizer(this, server);
            });
        });
    }
}
//# sourceMappingURL=net.js.map