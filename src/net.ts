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
  objects: any[];
  test: vec3;
}

interface StateUpdate extends Message {
  // todo: add inputs
  type: MessageType.StateUpdate;
  from: number;
  seq: number;
  data: Array<number>;
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
  private handleMessage(server: ServerId, message: Message) {
    console.log(`Received message of type ${MessageType[message.type]}`);
    switch (message.type) {
      case MessageType.Join: {
        // no other data associated with a join message
        let id = this.state.addPlayer();
        let response: JoinResponse = {
          type: MessageType.JoinResponse,
          you: id,
          objects: this.state.netObjects(),
          test: vec3.fromValues(1, 3, 4),
        };
        this.send(server, response, true);
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
      case MessageType.StateUpdate: {
        let msg = message as StateUpdate;
        let data = msg.data.values();
        while (true) {
          let next = data.next();
          if (next.done) {
            break;
          }
          let id = next.value;
          let obj = this.state.objects[id];
          if (!obj) {
            throw `State update for unrecognized id ${id}`;
          }
          let authority_seq = data.next().value;
          // lower numbered servers win authority ties
          if (
            obj.snap_seq < msg.seq &&
            (obj.authority_seq < authority_seq ||
              (obj.authority_seq == authority_seq && obj.authority <= msg.from))
          ) {
            // actually apply the state update
            obj.authority = msg.from;
            obj.authority_seq = authority_seq;
            obj.location = this.deserializeVec3(data);
            obj.linear_velocity = this.deserializeVec3(data);
            obj.rotation = this.deserializeQuat(data);
            obj.angular_velocity = this.deserializeVec3(data);
            obj.snap_seq = msg.seq;
          } else {
            // need to skip over some data
            this.deserializeVec3(data);
            this.deserializeVec3(data);
            this.deserializeQuat(data);
            this.deserializeVec3(data);
          }
        }
      }
    }
  }

  deserializeVec3(data: Iterator<number>) {
    let v0 = data.next().value;
    let v1 = data.next().value;
    let v2 = data.next().value;
    return vec3.fromValues(v0, v1, v2);
  }

  deserializeQuat(data: Iterator<number>) {
    let v0 = data.next().value;
    let v1 = data.next().value;
    let v2 = data.next().value;
    let v3 = data.next().value;
    return quat.fromValues(v0, v1, v2, v3);
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
