import { EM } from "../ecs/ecs.js";
import { OutOfRoomError, Serializer } from "../utils/serialize.js";
import {
  Authority,
  AuthorityDef,
  Inbox,
  InboxDef,
  MeDef,
  Outbox,
  OutboxDef,
  Peer,
  PeerDef,
  send,
  Sync,
  SyncDef,
  NetStatsDef,
  NetStats,
  RemoteUpdatesDef,
} from "./components.js";
import {
  Ack,
  deserializeEntity,
  EntityUpdateType,
  MAX_MESSAGE_SIZE,
  MessageType,
  serializeEntity,
} from "./message.js";
import { TimeDef } from "../time/time.js";
import { Phase } from "../ecs/sys-phase.js";

export function initNetSyncSystem() {
  EM.addSystem(
    "netSync",
    Phase.NETWORK,
    [AuthorityDef, SyncDef],
    [TimeDef, MeDef],
    (ents, res) => {
      // TODO(@darzu): this is a complex system that depends on [PeerDef, OutboxDef]
      //   and [AuthorityDef, SyncDef] entities. It possibly does work even if the query
      //   ents is empty which is very unusual for a system. Might need to rethink this
      //   b/c i'd i think we'd like to not call a system that has zero entities matching
      //   its query.
      // TODO: think about other ways of doing this
      if (res.time.step % 3 === 0) {
        const peers = EM.filterEntities_uncached([PeerDef, OutboxDef]);
        for (let { peer, outbox } of peers) {
          if (res.me.host && !peer.joined) continue;
          const entities = ents.filter(
            (ent) => ent.authority.pid == res.me.pid
          );
          for (let ent of entities) {
            const priorityIncrease = peer.entitiesKnown.has(ent.id)
              ? ent.sync.priorityIncrementDynamic
              : ent.sync.priorityIncrementFull;
            peer.entityPriorities.set(
              ent.id,
              priorityIncrease + (peer.entityPriorities.get(ent.id) || 0)
            );
          }
          entities.sort((o1, o2) => {
            return (
              peer.entityPriorities.get(o2.id)! -
              peer.entityPriorities.get(o1.id)!
            );
          });
          let message = new Serializer(MAX_MESSAGE_SIZE);
          let seq = peer.updateSeq++;
          message.writeUint8(MessageType.StateUpdate);
          message.writeUint32(seq);
          message.writeFloat32(res.time.time);
          let numEntities = 0;
          let numEntitiesIndex = message.writeUint8(numEntities);
          try {
            for (let ent of entities) {
              let type = peer.entitiesKnown.has(ent.id)
                ? EntityUpdateType.Dynamic
                : EntityUpdateType.Full;
              //console.log(`doing type ${type} sync of ${ent.id}`);
              const components =
                type === EntityUpdateType.Dynamic
                  ? ent.sync.dynamicComponents
                  : ent.sync.fullComponents.concat(ent.sync.dynamicComponents);
              // don't write anything at all if no components need to be synced
              if (components.length > 0) {
                serializeEntity(ent, message, type, components);
                if (type === EntityUpdateType.Full) {
                  if (!peer.entitiesInUpdate.has(seq)) {
                    peer.entitiesInUpdate.set(seq, new Set());
                  }
                  peer.entitiesInUpdate.get(seq)!.add(ent.id);
                }
                peer.entityPriorities.set(ent.id, 0);
                numEntities++;
              }
            }
          } catch (e) {
            if (!(e instanceof OutOfRoomError)) throw e;
          }
          message.writeUint8(numEntities, numEntitiesIndex);
          send(outbox, message.buffer);
        }
      }
    }
  );
}

export function initNetUpdateSystems() {
  const clearRemoteUpdatesMarkerSys = EM.addSystem(
    "clearRemoteUpdatesMarker",
    Phase.NETWORK,
    [RemoteUpdatesDef],
    [],
    (es) => {
      for (let i = es.length - 1; i >= 0; i--) {
        EM.removeComponent(es[i].id, RemoteUpdatesDef);
      }
    }
  );
  clearRemoteUpdatesMarkerSys.flags.allowQueryEdit = true;

  EM.addSystem(
    "netUpdate",
    Phase.NETWORK,
    [PeerDef, InboxDef, OutboxDef],
    [TimeDef, MeDef, NetStatsDef],
    (peers, res) => {
      for (let {
        peer: { address },
        inbox,
        outbox,
      } of peers) {
        // TODO: do we need to sort these in sequence number order?
        const updates = inbox.get(MessageType.StateUpdate) || [];
        while (updates.length > 0) {
          let message = updates.shift()!;
          let seq = message.readUint32();
          let ts = message.readFloat32();
          let dt =
            res.time.lastTime - (ts - res.netStats.skewEstimate[address]);
          let numEntities = message.readUint8();
          for (let i = 0; i < numEntities; i++) {
            deserializeEntity(seq, message, dt);
            // reset message.dummy
            message.dummy = false;
          }
          let ack = Ack(seq);
          send(outbox, ack.buffer);
        }
      }
    }
  );
}

export function initNetAckUpdateSystem() {
  function ack(
    peers: readonly { peer: Peer; inbox: Inbox }[],
    {
      time,
      me,
    }: {
      time: { dt: number };
      me: { pid: number };
    }
  ) {
    for (let { peer, inbox } of peers) {
      const acks = inbox.get(MessageType.StateUpdateResponse) || [];
      while (acks.length > 0) {
        let message = acks.shift()!;
        let seq = message.readUint32();
        let entities = peer.entitiesInUpdate.get(seq);
        if (entities) {
          for (let entity of entities) {
            peer.entitiesKnown.add(entity);
          }
        }
      }
    }
  }
  EM.addSystem(
    "netAck",
    Phase.NETWORK,
    [PeerDef, InboxDef],
    [TimeDef, MeDef],
    ack
  );
}
