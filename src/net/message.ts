import { EM } from "../ecs/ecs.js";
import { Serializer, Deserializer } from "../utils/serialize.js";
import {
  AuthorityDef,
  Authority,
  claimAuthority,
  Sync,
  PredictDef,
  RemoteUpdatesDef,
} from "./components.js";

export enum MessageType {
  // Join a game in progress
  Join,
  Rejoin,
  JoinResponse,
  // Events
  Events,
  AckEvents,
  EventRequests,
  AckEventRequests,
  // State update
  StateUpdate,
  StateUpdateResponse,
  // Reserve unique object IDs
  ReserveIDs,
  ReserveIDsResponse,
  // Estimate clock skew
  Ping,
  Pong,
}

export enum EntityUpdateType {
  Full,
  Dynamic,
}

export const MAX_MESSAGE_SIZE = 1024;

export function serializeEntity(
  ent: { id: number; authority: Authority; sync: Sync },
  message: Serializer,
  type: EntityUpdateType,
  components: number[]
) {
  message.writeUint8(type);
  message.writeUint32(ent.id);
  message.writeUint8(ent.authority.pid);
  message.writeUint32(ent.authority.seq);

  message.writeUint8(components.length);
  for (let componentId of components) {
    message.writeUint32(componentId);
    EM.serialize(ent.id, componentId, message);
  }
}

export function deserializeEntity(
  updateSeq: number,
  message: Deserializer,
  dt: number
) {
  let type: EntityUpdateType = message.readUint8();
  let id = message.readUint32();
  let authorityPid = message.readUint8();
  let authoritySeq = message.readUint32();
  let haveEnt = EM.hasEntity(id);
  if (!haveEnt && type === EntityUpdateType.Dynamic) {
    throw `Got non-full update for unknown entity ${id}`;
  }
  let authority;
  if (!haveEnt) {
    EM.registerEntity(id);
    // TODO(@darzu): dbg
    // console.log(`registering ${id}`);
    authority = EM.addComponent(id, AuthorityDef, authorityPid);
    authority.seq = authoritySeq;
  } else {
    authority = EM.findEntity(id, [AuthorityDef])?.authority;
  }
  // We want to set message.dummy if either:
  //
  // - There's no authority component. This means we have this entity but its
  //   authority got deleted, which means the entity is no more
  //
  // - There's an authority component but our authority claim fails, meaning
  //   this message is out of date
  if (
    !authority ||
    !claimAuthority(authority, authorityPid, authoritySeq, updateSeq)
  ) {
    console.log("failed authority check");
    message.dummy = true;
  }
  let numComponents = message.readUint8();
  for (let i = 0; i < numComponents; i++) {
    let componentId = message.readUint32();
    EM.deserialize(id, componentId, message);
  }
  if (!message.dummy) {
    let predict = EM.findEntity(id, [PredictDef])?.predict;
    if (predict) {
      predict.dt += dt;
    }
    EM.ensureComponent(id, RemoteUpdatesDef);
  }
}

export function Ack(seq: number) {
  let message = new Serializer(8);
  message.writeUint8(MessageType.StateUpdateResponse);
  message.writeUint32(seq);
  return message;
}
