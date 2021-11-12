import { EntityManager, TimeDef } from "../entity-manager.js";
import { Component } from "../renderer.js";
import { Net } from "../net.js";
import { Serializer, Deserializer, OutOfRoomError } from "../serialize.js";
import {
  SyncDef,
  Sync,
  AuthorityDef,
  Authority,
  PeerDef,
  DeletedDef,
  MeDef,
  InboxDef,
  Inbox,
  OutboxDef,
  Outbox,
  JoinedDef,
  send,
} from "./components.js";
import {
  MessageType,
  MAX_MESSAGE_SIZE,
  EntityUpdateType,
  serializeEntity,
  deserializeEntity,
  Ack,
} from "./message.js";

export function registerSyncSystem(em: EntityManager) {
  function sync(
    ents: { id: number; sync: Sync; authority: Authority }[],
    { time, me }: { time: { dt: number }; me: { pid: number; host: boolean } }
  ) {
    const peers = em.filterEntities([PeerDef, OutboxDef]);
    for (let { peer, outbox } of peers) {
      if (me.host && !peer.joined) continue;
      const entities = ents.filter(
        (ent) =>
          (!em.findEntity(ent.id, [DeletedDef]) &&
            ent.authority.pid == me.pid) ||
          (ent.authority.creatorPid == me.pid &&
            !peer.entitiesKnown.has(ent.id))
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
          peer.entityPriorities.get(o2.id)! - peer.entityPriorities.get(o1.id)!
        );
      });
      let message = new Serializer(MAX_MESSAGE_SIZE);
      let seq = peer.updateSeq++;
      message.writeUint8(MessageType.StateUpdate);
      message.writeUint32(seq);
      message.writeFloat32(performance.now());
      let numEntities = 0;
      let numEntitiesIndex = message.writeUint8(numEntities);
      try {
        // events always get synced before entities
        for (let ent of entities) {
          //console.log(`Trying to sync object ${obj.id}`);
          // TODO: could this be a 16-bit integer instead?
          let type = peer.entitiesKnown.has(ent.id)
            ? EntityUpdateType.Dynamic
            : ent.authority.pid === me.pid
            ? EntityUpdateType.Full
            : EntityUpdateType.Create;
          serializeEntity(em, ent, message, type);
          if (
            type !== EntityUpdateType.Dynamic &&
            !peer.entitiesInUpdate.has(seq)
          ) {
            peer.entitiesInUpdate.set(seq, new Set());
          }
          peer.entitiesInUpdate.get(seq)!.add(ent.id);
          peer.entityPriorities.set(ent.id, 0);
          numEntities++;
        }
      } catch (e) {
        if (!(e instanceof OutOfRoomError)) throw e;
      }
      message.writeUint8(numEntities, numEntitiesIndex);
      send(outbox, message.buffer, false);
    }
  }
  em.registerSystem([AuthorityDef, SyncDef], [TimeDef, MeDef, JoinedDef], sync);
}

export function registerUpdateSystem(em: EntityManager) {
  function update(
    peers: { peer: { address: string }; inbox: Inbox; outbox: Outbox }[],
    {
      time,
      me,
    }: {
      time: { dt: number };
      me: { pid: number };
    }
  ) {
    // TODO: this should be the time at the beginning of the frame
    let atTime = performance.now();
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
        let dt = atTime - ts;
        let numEntities = message.readUint8();
        for (let i = 0; i < numEntities; i++) {
          deserializeEntity(em, seq, message);
        }
        // TODO: queue entity for prediction
        let ack = Ack(seq);
        send(outbox, ack.buffer, false);
      }
    }
  }

  em.registerSystem(
    [PeerDef, InboxDef, OutboxDef],
    [TimeDef, MeDef, JoinedDef],
    update
  );
}
