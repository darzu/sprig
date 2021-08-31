import Peer from "./peerjs.js";
import { GameObject, GameState } from "./state.js";
import { vec3, quat } from "./gl-matrix.js";

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

  private send(server: ServerId, message: Message, reliable: boolean) {
    console.log(`Sending message of type ${MessageType[message.type]}`);
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
    console.log(`Received message of type ${MessageType[message.type]}`);
    switch (message.type) {
      case MessageType.Join: {
        // no other data associated with a join message
        let [id, playerNetObj] = this.state.addPlayer();
        let response: JoinResponse = {
          type: MessageType.JoinResponse,
          you: id,
          objects: this.state.netObjects(),
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
        for (let obj of msg.objects) {
          this.state.addObjectFromNet(obj);
        }
        this.ready(this.me);
        break;
      }
      case MessageType.AddObjects: {
        let msg = message as AddObjects;
        for (let netObj of msg.objects) {
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
        let msg = message as StateUpdate;
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
            } else if (this.shouldAcceptUpdate(latest_update, update)) {
              this.unapplied_updates[update.id] = update;
            }
          } else if (this.shouldAcceptUpdate(obj, update)) {
            this.applyUpdate(obj, update);
          }
        }
      }
    }
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
    // build snapshot
    let data = new Array();
    for (let obj of Object.values(this.state.objects)) {
      if (obj.authority === this.state.me) {
        // TODO: add a way of selectively snapshotting objects. for now, just
        // sync everything we have authority over
        data.push(obj.id);
        data.push(obj.authority_seq);
        this.serializeVec3(data, obj.location);
        this.serializeVec3(data, obj.linear_velocity);
        this.serializeQuat(data, obj.rotation);
        this.serializeVec3(data, obj.angular_velocity);
      }
    }
    let msg: StateUpdate = {
      type: MessageType.StateUpdate,
      seq: this.snap_seq,
      data: data,
      from: this.state.me,
    };

    for (let server of this.peers) {
      // TODO: this should be sent/received unreliably
      this.send(server, msg, false);
    }
    this.snap_seq++;
  }

  // listen for incoming connections
  private awaitConnections() {
    this.peer.on("connection", (conn: DataConnection) => {
      if (conn.reliable) {
        this.reliableConnections[conn.peer] = conn;
      } else {
        this.unreliableConnections[conn.peer] = conn;
      }
      this.setupConnection(conn);
    });
  }

  private connectTo(server: ServerId) {
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
}
