import Peer from "./peerjs.js";
import { GameObject, NetObject, GameState } from "./state.js";
import { vec3, quat } from "./gl-matrix.js";

// fraction of state updates to artificially drop
const DROP_PROBABILITY = 0.0;

const DELAY_SENDS = false;
const SEND_DELAY = 60.0;
const SEND_DELAY_JITTER = 60.0;

const MAX_OBJECTS_PER_STATE_UPDATE = 16;

type DataConnection = Peer.DataConnection;

enum MessageType {
  // Join a game in progress
  Join,
  JoinResponse,
  // State update
  StateUpdate,
  StateUpdateResponse,
  // Adds objects to the game
  AddObjects,
  // Reserve unique object IDs
  ReserveIDs,
  ReserveIDsResponse,
}

interface Message {
  type: MessageType;
}

interface JoinResponse extends Message {
  type: MessageType.JoinResponse;
  you: number;
  peers: ServerId[];
  objects: any[];
}

interface StateUpdate extends Message {
  // todo: add inputs
  type: MessageType.StateUpdate;
  from: number;
  seq: number;
  data: Array<number>;
}

interface AddObjects extends Message {
  type: MessageType.AddObjects;
  objects: any[];
}

// TODO: change to number?
type ServerId = string;

/*class ArrayReader<T> {
  buf: Array<T>;
  index: number = 0;

  constructor(buf: Array<T>) {
    this.buf = buf;
  }

  next(
}*/

interface ObjectUpdate {
  id: number;
  authority: number;
  authority_seq: number;
  location: vec3;
  linear_velocity: vec3;
  rotation: quat;
  angular_velocity: vec3;
  snap_seq: number;
}

function deserializeVec3(data: Iterator<number>) {
  let v0 = data.next().value;
  let v1 = data.next().value;
  let v2 = data.next().value;
  return vec3.fromValues(v0, v1, v2);
}

function deserializeQuat(data: Iterator<number>) {
  let v0 = data.next().value;
  let v1 = data.next().value;
  let v2 = data.next().value;
  let v3 = data.next().value;
  return quat.fromValues(v0, v1, v2, v3);
}

function deserializeObjectUpdates(msg: StateUpdate): ObjectUpdate[] {
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

// target length for jitter buffer
const BUFFER_TARGET = 3;

export class Net<Inputs> {
  private state: GameState<Inputs>;
  private host: boolean;
  private peer: Peer;
  private me: ServerId = "";
  private peers: ServerId[] = [];
  private reliableConnections: Record<ServerId, DataConnection> = {};
  private unreliableConnections: Record<ServerId, DataConnection> = {};
  private ready: (id: string) => void;
  private snap_seq: number = 0;
  private unapplied_updates: Record<number, ObjectUpdate> = {};
  private object_priorities: Record<number, number> = {};
  private objects_known: Record<number, ServerId[]> = {};
  private state_updates: Record<ServerId, StateUpdate[]> = {};
  private latest_update_applied: Record<ServerId, number> = {};
  private waiting: Record<ServerId, boolean> = {};
  private objectsToAdd: Record<number, NetObject> = {};

  private objectKnownToServer(obj: GameObject, server: ServerId) {
    return (
      this.objects_known[obj.id] && this.objects_known[obj.id].includes(server)
    );
  }

  private syncObject(obj: GameObject) {
    if (obj.creator !== this.state.me) {
      // don't try to sync objects we didn't create
      return;
    }
    for (let server of this.peers) {
      if (!this.objectKnownToServer(obj, server)) {
        // make sure we send at least one state update for newly-added objects
        this.object_priorities[obj.id] += 5000;
        let netObj = obj.netObject();
        let addObjects: AddObjects = {
          type: MessageType.AddObjects,
          objects: [netObj],
        };
        this.send(server, addObjects, true);
        this.recordObjectKnown(obj.id, server);
      }
    }
  }

  private recordObjectKnown(id: number, server: ServerId) {
    if (!this.objects_known[id]) {
      this.objects_known[id] = [server];
    } else if (!this.objects_known[id].includes(server)) {
      this.objects_known[id].push(server);
    }
  }

  private send(server: ServerId, message: Message, reliable: boolean) {
    if (message.type !== MessageType.StateUpdate) {
      console.log(
        `Sending message of type ${MessageType[message.type]} to ${server}`
      );
    }
    let conn = reliable
      ? this.reliableConnections[server]
      : this.unreliableConnections[server];
    conn.send(message);
  }

  private setupConnection(conn: DataConnection) {
    conn.on("data", (data) => {
      this.handleMessage(conn.peer, data);
    });
  }

  shouldAcceptUpdate(obj: ObjectUpdate, update: ObjectUpdate) {
    return (
      obj.authority_seq < update.authority_seq ||
      (obj.authority_seq == update.authority_seq &&
        obj.authority < update.authority) ||
      (obj.authority == update.authority && obj.snap_seq < update.snap_seq)
    );
  }

  private applyUpdate(obj: GameObject, update: ObjectUpdate) {
    obj.authority = update.authority;
    obj.authority_seq = update.authority_seq;
    obj.linear_velocity = update.linear_velocity;
    obj.angular_velocity = update.angular_velocity;
    obj.snap_seq = update.snap_seq;
    obj.snapLocation(update.location);
    obj.snapRotation(update.rotation);
  }

  private handleMessage(server: ServerId, message: Message) {
    if (message.type !== MessageType.StateUpdate) {
      console.log(
        `Received message of type ${MessageType[message.type]} from ${server}`
      );
    }
    switch (message.type) {
      case MessageType.Join: {
        // no other data associated with a join message
        let [id, playerNetObj] = this.state.addPlayer();
        let objects = this.state.netObjects();
        // the joining server will know about all of the objects we're sending,
        // no need to tell it about them again
        objects.forEach((o) => this.recordObjectKnown(o.id, server));
        let response: JoinResponse = {
          type: MessageType.JoinResponse,
          you: id,
          objects,
          peers: this.peers,
        };
        this.send(server, response, true);
        let addObjects: AddObjects = {
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
        let msg = message as JoinResponse;
        this.state.me = msg.you;
        // TODO: this is a hack, need to actually have some system for reserving
        // object ids at each node
        this.state.nextObjectId = msg.you * 10000;
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
        let msg = message as AddObjects;
        for (let netObj of msg.objects) {
          if (this.state.objects[netObj.id]) {
            // TODO: this should never happen
            console.log(`Got known object ${netObj.id} from ${server}`);
            break;
          }
          this.recordObjectKnown(netObj.id, server);
          let update = this.unapplied_updates[netObj.id];
          if (update) {
            let obj = this.state.addObjectFromNet(netObj);
            if (this.shouldAcceptUpdate(obj, update)) {
              this.applyUpdate(obj, update);
            }
          } else {
            this.objectsToAdd[netObj.id] = netObj;
          }
        }
        break;
      }
      case MessageType.StateUpdate: {
        let msg = message as StateUpdate;
        // don't apply this update yet--buffer it for the next time we're ready
        // for updates
        if (!this.state_updates[server]) {
          this.state_updates[server] = [];
        }
        let i = 0;
        while (i < this.state_updates[server].length) {
          if (msg.seq < this.state_updates[server][i].seq) {
            break;
          }
          i++;
        }
        this.state_updates[server].splice(i, 0, msg);
      }
    }
  }

  private updateObjectPriorities() {
    for (let obj of Object.values(this.state.objects)) {
      let priority_increase = obj.syncPriority();
      if (!this.object_priorities[obj.id]) {
        this.object_priorities[obj.id] = priority_increase;
      } else {
        this.object_priorities[obj.id] += priority_increase;
      }
    }
  }

  private objectsToSync(): GameObject[] {
    // TODO: there's gotta be a way to do this faster than O(N log N) in the
    // number of objects.  Could maybe use priority queues? with an efficient
    // heap can get amortized O(1) on key-increase ops, so setting the priorities should be O(N).
    // Then we're removing a constant # of items, so removing should be O(log N) overall?
    // Could also cache this sorted list--order will stay mostly the same so with a sort that's
    // optimized for mostly-ordered data (like TimSort) the sort should be O(N)
    let objects = Object.values(this.state.objects);
    objects = objects.filter((obj) => obj.authority == this.state.me);
    // sort objects in descending order by priority
    objects.sort(
      (o1, o2) => this.object_priorities[o2.id] - this.object_priorities[o1.id]
    );
    return objects.slice(0, MAX_OBJECTS_PER_STATE_UPDATE);
  }

  serializeVec3(data: Array<number>, v: vec3) {
    data.push(v[0]);
    data.push(v[1]);
    data.push(v[2]);
  }

  serializeQuat(data: Array<number>, q: quat) {
    data.push(q[0]);
    data.push(q[1]);
    data.push(q[2]);
    data.push(q[3]);
  }

  sendStateUpdates() {
    this.updateObjectPriorities();
    // make sure we've added objects everywhere we need to
    for (let obj of Object.values(this.state.objects)) {
      this.syncObject(obj);
    }
    let objects = this.objectsToSync();
    // build snapshot
    let data = new Array();
    for (let obj of objects) {
      this.object_priorities[obj.id] = 0;
      data.push(obj.id);
      data.push(obj.authority_seq);
      this.serializeVec3(data, obj.location);
      this.serializeVec3(data, obj.linear_velocity);
      this.serializeQuat(data, obj.rotation);
      this.serializeVec3(data, obj.angular_velocity);
    }
    let msg: StateUpdate = {
      type: MessageType.StateUpdate,
      seq: this.snap_seq,
      data: data,
      from: this.state.me,
    };

    for (let server of this.peers) {
      if (Math.random() >= DROP_PROBABILITY) {
        if (DELAY_SENDS) {
          setTimeout(
            () => this.send(server, msg, false),
            SEND_DELAY + Math.random() * SEND_DELAY_JITTER
          );
        } else {
          this.send(server, msg, false);
        }
      }
    }
    this.snap_seq++;
  }

  applyStateUpdate(msg: StateUpdate) {
    let updates = deserializeObjectUpdates(msg);
    for (let update of updates) {
      // do we know about this object?
      let obj = this.state.objects[update.id];
      if (!obj) {
        if (this.objectsToAdd[update.id]) {
          let netObj = this.objectsToAdd[update.id];
          let obj = this.state.addObjectFromNet(netObj);
          this.applyUpdate(obj, update);
        }
        // we've never heard of this object before, so we need to save this
        // update and apply it once we do hear about this object.
        // BUT: we only want to save the most up-to-date snapshot,
        // according to both the snapshot and authority sequences!
        let latest_update = this.unapplied_updates[update.id];
        if (!latest_update) {
          this.unapplied_updates[update.id] = update;
        } else if (this.shouldAcceptUpdate(latest_update, update)) {
          this.unapplied_updates[update.id] = update;
        }
      } else if (this.shouldAcceptUpdate(obj, update)) {
        this.applyUpdate(obj, update);
      }
    }
  }

  updateState() {
    for (let server of this.peers) {
      console.log(
        `Have ${
          this.state_updates[server] ? this.state_updates[server].length : 0
        } buffered state updates`
      );
      // first, apply any old updates ASAP
      while (
        this.state_updates[server] &&
        this.state_updates[server].length > 0 &&
        this.state_updates[server][0].seq < this.latest_update_applied[server]
      ) {
        let msg = this.state_updates[server].shift() as StateUpdate;
        console.log(`Applying old state update ${msg.seq} from ${server}`);
        this.applyStateUpdate(msg);
        this.latest_update_applied[server] = msg.seq;
      }
      if (
        !this.state_updates[server] ||
        this.state_updates[server].length === 0
      ) {
        // buffer some state updates from this server
        this.waiting[server] = true;
        continue;
      } else if (
        !this.waiting[server] ||
        this.state_updates[server].length >= BUFFER_TARGET
      ) {
        this.waiting[server] = false;
        do {
          let msg = this.state_updates[server].shift() as StateUpdate;
          this.applyStateUpdate(msg);
          this.latest_update_applied[server] = msg.seq;
          // if we've fallen significantly behind, want to catch up now
        } while (this.state_updates[server].length > BUFFER_TARGET * 2);
      }
    }
  }

  // listen for incoming connections
  private awaitConnections() {
    this.peer.on("connection", (conn: DataConnection) => {
      console.log(
        `Connection from ${conn.peer} with reliable: ${conn.reliable}`
      );
      if (conn.reliable) {
        this.reliableConnections[conn.peer] = conn;
      } else {
        this.unreliableConnections[conn.peer] = conn;
      }
      if (
        this.reliableConnections[conn.peer] &&
        this.unreliableConnections[conn.peer] &&
        !this.host
      ) {
        this.peers.push(conn.peer);
      }
      this.setupConnection(conn);
    });
  }

  private connectTo(server: ServerId) {
    console.log(`connecting to ${server}`);
    var reliableConn = this.peer.connect(server, { reliable: true });
    reliableConn.on("open", () => {
      var unreliableConn = this.peer.connect(server, { reliable: false });
      unreliableConn.on("open", () => {
        this.reliableConnections[server] = reliableConn;
        this.unreliableConnections[server] = unreliableConn;
        this.setupConnection(reliableConn);
        this.setupConnection(unreliableConn);
        this.peers.push(server);
      });
    });
  }

  constructor(
    state: GameState<Inputs>,
    host: ServerId | null,
    ready: (id: string) => void
  ) {
    this.state = state;
    this.ready = ready;
    if (host === null) {
      // we're the host, just start up
      this.host = true;
      this.peer = new Peer();
      this.peer.on("open", (id: string) => {
        this.awaitConnections();
        this.ready(id);
      });
    } else {
      // we need to connect to another host
      this.host = false;
      this.peers = [host];
      this.peer = new Peer();
      this.peer.on("open", (id: string) => {
        this.awaitConnections();
        var reliableConn = this.peer.connect(host, { reliable: true });
        reliableConn.on("open", () => {
          var unreliableConn = this.peer.connect(host, { reliable: false });
          unreliableConn.on("open", () => {
            this.reliableConnections[host] = reliableConn;
            this.unreliableConnections[host] = unreliableConn;
            this.setupConnection(reliableConn);
            this.setupConnection(unreliableConn);
            this.send(host, { type: MessageType.Join }, true);
          });
        });
      });
    }
  }
}
