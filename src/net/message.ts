import { EM } from "../entity-manager.js";
import { Serializer, Deserializer } from "../serialize.js";
import { AuthorityDef, Authority, claimAuthority, Sync } from "./components.js";

export enum MessageType {
  // Join a game in progress
  Join,
  JoinResponse,
  // State update
  Event,
  EventRequest,
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
  Create,
}

export const MAX_MESSAGE_SIZE = 1024;

export function serializeEntity(
  ent: { id: number; authority: Authority; sync: Sync },
  message: Serializer,
  type: EntityUpdateType
) {
  message.writeUint8(type);
  message.writeUint32(ent.id);
  message.writeUint8(ent.authority.pid);
  message.writeUint32(ent.authority.seq);
  if (type === EntityUpdateType.Full || type === EntityUpdateType.Create)
    message.writeUint8(ent.authority.creatorPid);

  message.writeUint8(
    type === EntityUpdateType.Dynamic
      ? ent.sync.dynamicComponents.length
      : ent.sync.fullComponents.length
  );
  for (let componentId of type === EntityUpdateType.Dynamic
    ? ent.sync.dynamicComponents
    : ent.sync.fullComponents) {
    message.writeUint32(componentId);
    EM.serialize(ent.id, componentId, message);
  }
}

export function deserializeEntity(updateSeq: number, message: Deserializer) {
  let type: EntityUpdateType = message.readUint8();
  let id = message.readUint8();
  let authorityPid = message.readUint8();
  let authoritySeq = message.readUint32();
  let creatorPid: number | undefined;
  if (type === EntityUpdateType.Full || type === EntityUpdateType.Create) {
    creatorPid = message.readUint8();
  }
  let ent = EM.findEntity(id, [AuthorityDef]);
  let entExisted = !!ent;
  let authority = ent && ent.authority;
  if (!ent && type === EntityUpdateType.Dynamic)
    throw `Got non-full update for unknown entity ${id}`;
  if (!ent) {
    if (type === EntityUpdateType.Dynamic)
      throw `Got non-full update for unknown entity ${id}`;
    EM.registerEntity(id);
    authority = EM.addComponent(id, AuthorityDef);
    authority.pid = authorityPid;
    authority.seq = authoritySeq;
    authority.creatorPid = creatorPid!;
  }
  if (
    (entExisted && type === EntityUpdateType.Create) ||
    !claimAuthority(authority!, authorityPid, authoritySeq, updateSeq)
  ) {
    message.dummy = true;
  }
  let numComponents = message.readUint8();
  for (let i = 0; i < numComponents; i++) {
    let componentId = message.readUint32();
    EM.deserialize(id, componentId, message);
  }
}

export function Ack(seq: number) {
  let message = new Serializer(8);
  message.writeUint8(MessageType.StateUpdateResponse);
  message.writeUint32(seq);
  return message;
}
