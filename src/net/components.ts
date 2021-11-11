import { EM } from "../entity-manager.js";
import { Component } from "../renderer.js";
import { MessageType } from "./message.js";

export const SyncDef = EM.defineComponent("sync", () => ({
  priorityIncrementFull: 1000,
  priorityIncrementDynamic: 10,
  fullComponents: [],
  dynamicComponents: [],
}));

export type Sync = Component<typeof SyncDef>;

export const PeerDef = EM.defineComponent("peer", () => ({
  address: "",
  host: false,
  ping: 0,
  skew: 0,

  // TODO: consider moving this state to another component
  updateSeq: 0,
  entityPriorities: new Map<number, number>(),
  entitiesKnown: new Set<number>(),
  entitiesInUpdate: new Map<number, Set<number>>(),
}));

export type Peer = Component<typeof PeerDef>;

export const AuthorityDef = EM.defineComponent("authority", () => ({
  creatorPid: 0,
  pid: 0,
  seq: 0,
  updateSeq: 0,
}));

export type Authority = Component<typeof AuthorityDef>;

export function claimAuthority(
  authority: Authority,
  pid: number,
  seq: number,
  updateSeq: number
) {
  if (
    (authority.updateSeq <= updateSeq &&
      authority.seq <= seq &&
      authority.pid === pid) ||
    authority.seq < seq ||
    (authority.seq === seq && pid < authority.pid)
  ) {
    authority.pid = pid;
    authority.seq = seq;
    authority.updateSeq = updateSeq;
    return true;
  }
  return false;
}

export const DeletedDef = EM.defineComponent("deleted", () => true);

export const MeDef = EM.defineComponent("me", () => ({
  pid: 0,
  host: false,
}));

export const InboxDef = EM.defineComponent(
  "inbox",
  () => new Map<MessageType, ArrayBuffer[]>()
);

export type Inbox = Component<typeof InboxDef>;

export const OutboxDef = EM.defineComponent("outbox", () => ({
  reliable: [] as DataView[],
  unreliable: [] as DataView[],
}));

export type Outbox = Component<typeof OutboxDef>;

export function send(outbox: Outbox, buffer: DataView, reliable: boolean) {
  if (reliable) {
    outbox.reliable.push(buffer);
  } else {
    outbox.unreliable.push(buffer);
  }
}
