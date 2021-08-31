import Peer from "./peerjs.js";
import { vec3, quat } from "./gl-matrix.js";
// fraction of state updates to artificially drop
const DROP_PROBABILITY = 0.0;
const MAX_OBJECTS_PER_STATE_UPDATE = 64;
var MessageType;
(function (MessageType) {
    // Join a game in progress
    MessageType[MessageType["Join"] = 0] = "Join";
    MessageType[MessageType["JoinResponse"] = 1] = "JoinResponse";
    // State update
    MessageType[MessageType["StateUpdate"] = 2] = "StateUpdate";
    MessageType[MessageType["StateUpdateResponse"] = 3] = "StateUpdateResponse";
    // Adds objects to the game
    MessageType[MessageType["AddObjects"] = 4] = "AddObjects";
    // Reserve unique object IDs
    MessageType[MessageType["ReserveIDs"] = 5] = "ReserveIDs";
    MessageType[MessageType["ReserveIDsResponse"] = 6] = "ReserveIDsResponse";
})(MessageType || (MessageType = {}));
function deserializeVec3(data) {
    let v0 = data.next().value;
    let v1 = data.next().value;
    let v2 = data.next().value;
    return vec3.fromValues(v0, v1, v2);
}
function deserializeQuat(data) {
    let v0 = data.next().value;
    let v1 = data.next().value;
    let v2 = data.next().value;
    let v3 = data.next().value;
    return quat.fromValues(v0, v1, v2, v3);
}
function deserializeObjectUpdates(msg) {
    let updates = [];
    let data = msg.data.values();
    while (true) {
        let next = data.next();
        if (next.done) {
            break;
        }
        let id = next.value;
        let authority = msg.from;
        let authority_seq = data.next().value;
        let location = deserializeVec3(data);
        let linear_velocity = deserializeVec3(data);
        let rotation = deserializeQuat(data);
        let angular_velocity = deserializeVec3(data);
        let snap_seq = msg.seq;
        updates.push({
            id,
            authority,
            authority_seq,
            location,
            linear_velocity,
            rotation,
            angular_velocity,
            snap_seq,
        });
    }
    return updates;
}
export class Net {
    constructor(state, host, ready) {
        this.me = "";
        this.peers = [];
        this.reliableConnections = {};
        this.unreliableConnections = {};
        this.snap_seq = 0;
        this.unapplied_updates = {};
        this.object_priorities = {};
        this.objects_known = {};
        this.state = state;
        this.ready = ready;
        if (host === null) {
            // we're the host, just start up
            this.host = true;
            this.peer = new Peer();
            this.peer.on("open", (id) => {
                this.awaitConnections();
                this.ready(id);
            });
        }
        else {
            // we need to connect to another host
            this.host = false;
            this.peers = [host];
            this.peer = new Peer();
            this.peer.on("open", (id) => {
                this.awaitConnections();
                var reliableConn = this.peer.connect(host, { reliable: true });
                reliableConn.on("open", () => {
                    var unreliableConn = this.peer.connect(host, { reliable: false });
                    unreliableConn.on("open", () => {
                        this.reliableConnections[host] = reliableConn;
                        this.unreliableConnections[host] = reliableConn;
                        this.setupConnection(reliableConn);
                        this.setupConnection(unreliableConn);
                        this.send(host, { type: MessageType.Join }, true);
                    });
                });
            });
        }
    }
    objectKnownToServer(obj, server) {
        return (this.objects_known[obj.id] && this.objects_known[obj.id].includes(server));
    }
    syncObject(obj) {
        if (obj.creator !== this.state.me) {
            // don't try to sync objects we didn't create
            return;
        }
        for (let server of this.peers) {
            if (!this.objectKnownToServer(obj, server)) {
                let addObjects = {
                    type: MessageType.AddObjects,
                    objects: [obj],
                };
                this.send(server, addObjects, true);
                this.recordObjectKnown(obj.id, server);
            }
        }
    }
    recordObjectKnown(id, server) {
        if (!this.objects_known[id]) {
            this.objects_known[id] = [server];
        }
        else if (!this.objects_known[id].includes(server)) {
            this.objects_known[id].push(server);
        }
    }
    send(server, message, reliable) {
        if (message.type !== MessageType.StateUpdate) {
            console.log(`Sending message of type ${MessageType[message.type]} to ${server}`);
        }
        let conn = reliable
            ? this.reliableConnections[server]
            : this.unreliableConnections[server];
        conn.send(message);
    }
    setupConnection(conn) {
        conn.on("data", (data) => {
            this.handleMessage(conn.peer, data);
        });
    }
    shouldAcceptUpdate(obj, update) {
        return (obj.authority_seq < update.authority_seq ||
            (obj.authority_seq == update.authority_seq &&
                obj.authority < update.authority) ||
            (obj.authority == update.authority && obj.snap_seq < update.snap_seq));
    }
    applyUpdate(obj, update) {
        obj.authority = update.authority;
        obj.authority_seq = update.authority_seq;
        obj.linear_velocity = update.linear_velocity;
        obj.angular_velocity = update.angular_velocity;
        obj.snap_seq = update.snap_seq;
        obj.snapLocation(update.location);
        obj.snapRotation(update.rotation);
    }
    handleMessage(server, message) {
        if (message.type !== MessageType.StateUpdate) {
            console.log(`Received message of type ${MessageType[message.type]} from ${server}`);
        }
        switch (message.type) {
            case MessageType.Join: {
                // no other data associated with a join message
                let [id, playerNetObj] = this.state.addPlayer();
                let objects = this.state.netObjects();
                // the joining server will know about all of the objects we're sending,
                // no need to tell it about them again
                objects.forEach((o) => this.recordObjectKnown(o.id, server));
                let response = {
                    type: MessageType.JoinResponse,
                    you: id,
                    objects,
                    peers: this.peers,
                };
                this.send(server, response, true);
                let addObjects = {
                    type: MessageType.AddObjects,
                    objects: [playerNetObj],
                };
                for (let peer of this.peers) {
                    this.send(peer, addObjects, true);
                }
                this.peers.push(server);
                break;
            }
            case MessageType.JoinResponse: {
                let msg = message;
                this.state.me = msg.you;
                for (let peer of msg.peers) {
                    this.connectTo(peer);
                }
                for (let obj of msg.objects) {
                    this.state.addObjectFromNet(obj);
                    this.recordObjectKnown(obj.id, server);
                    for (let peer of msg.peers) {
                        this.recordObjectKnown(obj.id, peer);
                    }
                }
                this.ready(this.me);
                break;
            }
            case MessageType.AddObjects: {
                let msg = message;
                for (let netObj of msg.objects) {
                    if (this.state.objects[netObj.id]) {
                        // TODO: this should never happen
                        console.log(`Got known object ${netObj.id} from ${server}`);
                        break;
                    }
                    this.recordObjectKnown(netObj.id, server);
                    let obj = this.state.addObjectFromNet(netObj);
                    let update = this.unapplied_updates[obj.id];
                    if (update) {
                        if (this.shouldAcceptUpdate(obj, update)) {
                            this.applyUpdate(obj, update);
                        }
                    }
                }
                break;
            }
            case MessageType.StateUpdate: {
                let msg = message;
                let updates = deserializeObjectUpdates(msg);
                for (let update of updates) {
                    // do we know about this object?
                    let obj = this.state.objects[update.id];
                    if (!obj) {
                        // we've never heard of this object before, so we need to save this
                        // update and apply it once we do hear about this object.
                        // BUT: we only want to save the most up-to-date snapshot,
                        // according to both the snapshot and authority sequences!
                        let latest_update = this.unapplied_updates[update.id];
                        if (!latest_update) {
                            this.unapplied_updates[update.id] = update;
                        }
                        else if (this.shouldAcceptUpdate(latest_update, update)) {
                            this.unapplied_updates[update.id] = update;
                        }
                    }
                    else if (this.shouldAcceptUpdate(obj, update)) {
                        this.applyUpdate(obj, update);
                    }
                }
            }
        }
    }
    updateObjectPriorities() {
        for (let obj of Object.values(this.state.objects)) {
            let priority_increase = obj.syncPriority();
            if (!this.object_priorities[obj.id]) {
                this.object_priorities[obj.id] = priority_increase;
            }
            else {
                this.object_priorities[obj.id] += priority_increase;
            }
        }
    }
    objectsToSync() {
        // TODO: there's gotta be a way to do this faster than O(N log N) in the
        // number of objects.  Could maybe use priority queues? with an efficient
        // heap can get amortized O(1) on key-increase ops, so setting the priorities should be O(N).
        // Then we're removing a constant # of items, so removing should be O(log N) overall?
        // Could also cache this sorted list--order will stay mostly the same so with a sort that's
        // optimized for mostly-ordered data (like TimSort) the sort should be O(N)
        let objects = Object.values(this.state.objects);
        objects = objects.filter((obj) => obj.authority == this.state.me);
        // sort objects in descending order by priority
        objects.sort((o1, o2) => this.object_priorities[o2.id] - this.object_priorities[o1.id]);
        return objects.slice(0, MAX_OBJECTS_PER_STATE_UPDATE);
    }
    serializeVec3(data, v) {
        data.push(v[0]);
        data.push(v[1]);
        data.push(v[2]);
    }
    serializeQuat(data, q) {
        data.push(q[0]);
        data.push(q[1]);
        data.push(q[2]);
        data.push(q[3]);
    }
    sendStateUpdates() {
        this.updateObjectPriorities();
        let objects = this.objectsToSync();
        // build snapshot
        let data = new Array();
        for (let obj of objects) {
            this.syncObject(obj.netObject());
            data.push(obj.id);
            data.push(obj.authority_seq);
            this.serializeVec3(data, obj.location);
            this.serializeVec3(data, obj.linear_velocity);
            this.serializeQuat(data, obj.rotation);
            this.serializeVec3(data, obj.angular_velocity);
        }
        let msg = {
            type: MessageType.StateUpdate,
            seq: this.snap_seq,
            data: data,
            from: this.state.me,
        };
        for (let server of this.peers) {
            if (Math.random() >= DROP_PROBABILITY) {
                this.send(server, msg, false);
            }
        }
        this.snap_seq++;
    }
    // listen for incoming connections
    awaitConnections() {
        this.peer.on("connection", (conn) => {
            console.log(`Connection from ${conn.peer} with reliable: ${conn.reliable}`);
            if (conn.reliable) {
                this.reliableConnections[conn.peer] = conn;
            }
            else {
                this.unreliableConnections[conn.peer] = conn;
            }
            if (this.reliableConnections[conn.peer] &&
                this.unreliableConnections[conn.peer] &&
                !this.host) {
                this.peers.push(conn.peer);
            }
            this.setupConnection(conn);
        });
    }
    connectTo(server) {
        console.log(`connecting to ${server}`);
        var reliableConn = this.peer.connect(server, { reliable: true });
        reliableConn.on("open", () => {
            var unreliableConn = this.peer.connect(server, { reliable: false });
            unreliableConn.on("open", () => {
                this.reliableConnections[server] = reliableConn;
                this.unreliableConnections[server] = reliableConn;
                this.setupConnection(reliableConn);
                this.setupConnection(unreliableConn);
                this.peers.push(server);
            });
        });
    }
}
//# sourceMappingURL=net.js.map