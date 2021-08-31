import { Peer } from "./peer.js";
import { GameObject, GameState } from "./state.js";
import { Serializer, Deserializer, OutOfRoomError } from "./serialize.js";
import { vec3, quat } from "./gl-matrix.js";

// fraction of state updates to artificially drop
const DROP_PROBABILITY = 0.0;

const DELAY_SENDS = false;
const SEND_DELAY = 60.0;
const SEND_DELAY_JITTER = 60.0;

const MAX_MESSAGE_SIZE = 1000;

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

enum ObjectUpdateType {
  Full,
  Dynamic,
  Create,
  Delta, // delta is unused for now
}

// TODO: change to number?
type ServerId = string;

// target length for jitter buffer
const BUFFER_TARGET = 3;

// Responsible for sync-ing objects to a *particular* other server.
class StateSynchronizer<Inputs> {
  net: Net<Inputs>;
  remoteId: ServerId;
  updateSeq: number = 0;
  objectPriorities: Record<number, number> = {};
  objectsKnown: Set<number> = new Set();
  objectsInUpdate: Record<number, Set<number>> = {};

  constructor(net: Net<Inputs>, remoteId: ServerId) {
    this.net = net;
    this.remoteId = remoteId;
  }

  private objects(): GameObject[] {
    // TODO: there's gotta be a way to do this faster than O(N log N) in the
    // number of objects.  Could maybe use priority queues? with an efficient
    // heap can get amortized O(1) on key-increase ops, so setting the priorities should be O(N).
    // Then we're removing a constant # of items, so removing should be O(log N) overall?
    // Could also cache this sorted list--order will stay mostly the same so with a sort that's
    // optimized for mostly-ordered data (like TimSort) the sort should be O(N)
    let objects = Object.values(this.net.state.objects);
    objects = objects.filter(
      (obj) =>
        obj.authority == this.net.state.me ||
        (obj.creator == this.net.state.me && !this.objectsKnown.has(obj.id))
    );
    for (let obj of objects) {
      let priorityIncrease = obj.syncPriority();
      if (!this.objectsKnown.has(obj.id)) {
        // try to sync new objects
        priorityIncrease += 1000;
      }
      if (!this.objectPriorities[obj.id]) {
        this.objectPriorities[obj.id] = priorityIncrease;
      } else {
        this.objectPriorities[obj.id] += priorityIncrease;
      }
    }
    // We always want objects that this remote peer might not know
    // about to come first. After that, we want objects sorted in priority order.
    objects.sort((o1, o2) => {
      return this.objectPriorities[o2.id] - this.objectPriorities[o1.id];
    });
    return objects;
  }

  update() {
    //console.log("update() called");
    let message = new Serializer(MAX_MESSAGE_SIZE);
    let seq = this.updateSeq++;
    message.writeUint8(MessageType.StateUpdate);
    message.writeUint32(seq);
    let objects = this.objects();
    let numObjects = 0;
    let numObjectsIndex = message.writeUint8(numObjects);
    try {
      for (let obj of objects) {
        //console.log(`Trying to sync object ${obj.id}`);
        // TODO: could this be a 16-bit integer instead?
        message.writeUint32(obj.id);
        message.writeUint8(obj.authority);
        message.writeUint32(obj.authority_seq);
        if (this.objectsKnown.has(obj.id)) {
          // do a dynamic update
          message.writeUint8(ObjectUpdateType.Dynamic);
          obj.serializeDynamic(message);
        } else {
          // need to do a full sync
          if (obj.authority !== this.net.state.me) {
            message.writeUint8(ObjectUpdateType.Create);
          } else {
            message.writeUint8(ObjectUpdateType.Full);
          }
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
    } catch (e) {
      if (!(e instanceof OutOfRoomError)) throw e;
    }
    //console.log(`Update includes ${numObjects} objects`);
    message.writeUint8(numObjects, numObjectsIndex);
    this.net.send(this.remoteId, message.buffer, false);
  }

  ackUpdate(seq: number) {
    //console.log(`${seq} acked`);
    let ids = this.objectsInUpdate[seq];
    if (!ids) return;
    ids.forEach((id) => {
      //console.log(`Object ${id} is known`);
      this.objectsKnown.add(id);
    });
    // TODO: should probably GC old unacked messages as well to avoid unbounded
    // memory growth
    delete this.objectsInUpdate[seq];
  }
}

export class Net<Inputs> {
  state: GameState<Inputs>;
  private host: boolean;
  private peer: Peer;
  private me: ServerId = "";
  private peers: ServerId[] = [];
  private reliableChannels: Record<ServerId, RTCDataChannel> = {};
  private unreliableChannels: Record<ServerId, RTCDataChannel> = {};
  private ready: (id: string) => void;
  private stateUpdates: Record<ServerId, { seq: number; data: ArrayBuffer }[]> =
    {};
  private synchronizers: Record<ServerId, StateSynchronizer<Inputs>> = {};
  private nextUpdate: Record<ServerId, number> = {};
  private waiting: Record<ServerId, boolean> = {};
  private numDroppedUpdates: number = 0;

  send(server: ServerId, message: ArrayBuffer, reliable: boolean) {
    let conn = reliable
      ? this.reliableChannels[server]
      : this.unreliableChannels[server];
    conn.send(message);
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
    };
  }

  private setupChannel(server: string, chan: RTCDataChannel) {
    chan.onmessage = (ev) => {
      this.handleMessage(server, ev.data);
    };
  }

  private handleMessage(server: ServerId, data: ArrayBuffer) {
    let deserializer = new Deserializer(data);
    let type: MessageType = deserializer.readUint8();
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
      case MessageType.StateUpdateResponse: {
        let seq = deserializer.readUint32();
        this.synchronizers[server].ackUpdate(seq);
      }
    }
  }

  sendStateUpdates() {
    for (let synchronizer of Object.values(this.synchronizers)) {
      synchronizer.update();
    }
  }

  applyStateUpdate(data: ArrayBuffer) {
    //console.log("In applyStateUpdate");
    //console.log("Applying state update");
    let message = new Deserializer(data);
    let type = message.readUint8();
    if (type !== MessageType.StateUpdate)
      throw "Wacky message type in applyStateUpdate";
    let _seq = message.readUint32();
    let numObjects = message.readUint8();
    for (let i = 0; i < numObjects; i++) {
      // make sure we're not in dummy mode
      message.dummy = false;
      let id = message.readUint32();
      let authority = message.readUint8();
      let authority_seq = message.readUint32();
      let updateType: ObjectUpdateType = message.readUint8();
      if (
        updateType === ObjectUpdateType.Full ||
        updateType === ObjectUpdateType.Create
      ) {
        //console.log("Full state update");
        let typeId = message.readUint8();
        let creator = message.readUint8();
        let obj = this.state.objects[id];
        if (!obj) {
          obj = this.state.objectOfType(typeId, id, creator);
        }
        // Don't update an existing object if this was a create message or the authority claim is old
        if (
          (this.state.objects[id] && updateType === ObjectUpdateType.Create) ||
          !obj.claimAuthority(authority, authority_seq)
        ) {
          message.dummy = true;
        }
        obj.deserializeFull(message);
        if (!this.state.objects[id]) {
          this.state.addObject(obj);
        }
      } else if (updateType === ObjectUpdateType.Dynamic) {
        //console.log("Dynamic state update");
        let obj = this.state.objects[id];
        if (!obj) {
          throw "Got non-full update for unknown object ${id}";
        }
        if (!obj.claimAuthority(authority, authority_seq)) {
          message.dummy = true;
        }
        obj.deserializeDynamic(message);
      } else {
        throw `Unsupported update type ${updateType} in applyStateUpdate`;
      }
    }
  }

  updateState() {
    //console.log("In updateState");
    for (let server of this.peers) {
      /*console.log(
        `Have ${
          this.stateUpdates[server] ? this.stateUpdates[server].length : 0
        } buffered state updates`
        );*/
      //console.log(`Looking for update ${this.nextUpdate[server]}`);
      if (!this.nextUpdate[server]) {
        this.nextUpdate[server] = 0;
      }
      // first, ignore any old updates
      // TODO: should we apply these? Doug thinks not--we'd be out of sync.
      while (
        this.stateUpdates[server] &&
        this.stateUpdates[server].length > 0 &&
        this.stateUpdates[server][0].seq < this.nextUpdate[server]
      ) {
        let { seq } = this.stateUpdates[server].shift()!;
        this.numDroppedUpdates++;
        /*
        console.log(
          `Ignoring old state update ${seq} < ${this.nextUpdate[server]} from ${server}`
        );*/
      }
      // then, if we have many buffered updates, drop them until we've caught up
      if (
        this.stateUpdates[server] &&
        this.stateUpdates[server].length > BUFFER_TARGET * 2
      ) {
        //console.log("Buffer too large, dropping in order to catch up");
        while (this.stateUpdates[server].length > BUFFER_TARGET) {
          this.stateUpdates[server].shift();
          this.nextUpdate[server]++;
          this.numDroppedUpdates++;
        }
      }
      if (
        !this.stateUpdates[server] ||
        this.stateUpdates[server].length === 0
      ) {
        // buffer some state updates from this server
        //console.log("Buffering for updates");
        this.waiting[server] = true;
        continue;
      } else if (
        !this.waiting[server] ||
        this.stateUpdates[server].length >= BUFFER_TARGET
      ) {
        //console.log("Trying to apply an update");
        let { seq, data } = this.stateUpdates[server].shift()!;
        // if we were buffering, we're going to reset our "clock" to whatever we have now
        if (this.waiting[server]) {
          this.nextUpdate[server] = seq;
          this.waiting[server] = false;
        }
        if (this.nextUpdate[server] === seq) {
          this.applyStateUpdate(data);
          let ack = new Serializer(8);
          ack.writeUint8(MessageType.StateUpdateResponse);
          ack.writeUint32(seq);
          this.send(server, ack.buffer, false);
        } else {
          // put it back in the buffer, we're not ready yet
          this.stateUpdates[server].unshift({ seq, data });
        }
      }
      if (!this.waiting[server]) {
        this.nextUpdate[server]++;
      }
    }
  }

  // listen for incoming connections
  private awaitConnections() {
    this.peer.onconnection = (server, channel) => {
      let reliable =
        channel.maxRetransmits === null || channel.maxRetransmits > 0;
      //console.log(`Connection from ${server} with reliable: ${reliable}`);
      if (reliable) {
        this.reliableChannels[server] = channel;
      } else {
        this.unreliableChannels[server] = channel;
      }
      if (
        this.reliableChannels[server] &&
        this.unreliableChannels[server] &&
        !this.host
      ) {
        this.peers.push(server);
        this.synchronizers[server] = new StateSynchronizer(this, server);
      }
      this.setupChannel(server, channel);
    };
  }

  private connectTo(server: ServerId) {
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
      this.peer.onopen = (id: string) => {
        this.awaitConnections();
        this.ready(id);
      };
    } else {
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
}
