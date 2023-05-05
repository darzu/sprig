import { EM, Component } from "../ecs/entity-manager.js";
import { Deserializer } from "../utils/serialize.js";
import { MessageType } from "./message.js";
import { FromNetworkEvent, ToNetworkEvent } from "./network-events.js";

export const SyncDef = EM.defineComponent("sync", (dynamic?: number[]) => ({
  priorityIncrementFull: 1000,
  priorityIncrementDynamic: 10,
  fullComponents: [] as number[],
  dynamicComponents: dynamic ?? [],
}));

export type Sync = Component<typeof SyncDef>;

export const PeerDef = EM.defineComponent("peer", () => ({
  address: "",

  // TODO: consider moving this state to another component
  joined: false,
  pid: 0,
  updateSeq: 0,
  entityPriorities: new Map<number, number>(),
  entitiesKnown: new Set<number>(),
  entitiesInUpdate: new Map<number, Set<number>>(),
}));

export type Peer = Component<typeof PeerDef>;

export const HostDef = EM.defineComponent("host", () => true);

export const AuthorityDef = EM.defineComponent("authority", (pid?: number) => ({
  pid: pid || 0,
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

export const PeerNameDef = EM.defineComponent("peerName", (name?: string) => ({
  name: name || "",
}));

export type PeerName = Component<typeof PeerNameDef>;

export const MeDef = EM.defineComponent(
  "me",
  (pid?: number, host?: boolean) => ({
    pid: pid || 1,
    host: host || false,
  })
);

export type Me = Component<typeof MeDef>;

export const InboxDef = EM.defineComponent(
  "inbox",
  () => new Map<MessageType, Deserializer[]>()
);

export type Inbox = Component<typeof InboxDef>;

export const OutboxDef = EM.defineComponent("outbox", () => [] as DataView[]);

export type Outbox = Component<typeof OutboxDef>;

export function send(outbox: Outbox, buffer: DataView) {
  outbox.push(buffer);
}

export const NetStatsDef = EM.defineComponent("netStats", () => ({
  skewEstimate: {} as Record<string, number>,
  pingEstimate: {} as Record<string, number>,
}));

export type NetStats = Component<typeof NetStatsDef>;

export const EventsFromNetworkDef = EM.defineComponent(
  "eventsFromNetwork",
  () => [] as FromNetworkEvent[]
);

export type EventsFromNetwork = Component<typeof EventsFromNetworkDef>;

export const EventsToNetworkDef = EM.defineComponent(
  "eventsToNetwork",
  () => [] as ToNetworkEvent[]
);

export type EventsToNetwork = Component<typeof EventsToNetworkDef>;

export const NetworkReadyDef = EM.defineComponent("networkReady", () => true);
export const JoinDef = EM.defineComponent("join", (address: string) => ({
  address,
  state: "start" as "start" | "connecting" | "joining",
  lastSendTime: 0,
}));
export type Join = Component<typeof JoinDef>;

// This component should be present on entities that want to participate in the
// prediction system
export const PredictDef = EM.defineComponent("predict", () => ({
  dt: 0,
}));

export type Predict = Component<typeof PredictDef>;

// Marker component for entities that have just been updated by the sync system
export const RemoteUpdatesDef = EM.defineComponent("remoteUpdates", () => true);
