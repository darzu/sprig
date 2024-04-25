import { EM, Component } from "../ecs/entity-manager.js";
import { Resource } from "../ecs/em-resources.js";
import { Deserializer } from "../utils/serialize.js";
import { MessageType } from "./message.js";
import { FromNetworkEvent, ToNetworkEvent } from "./network-events.js";

export const SyncDef = EM.defineComponent(
  "sync",
  () => ({
    priorityIncrementFull: 1000,
    priorityIncrementDynamic: 10,
    fullComponents: [] as number[],
    dynamicComponents: [] as number[],
  }),
  (p, dynamic?: number[]) => {
    if (dynamic) p.dynamicComponents = dynamic;
    return p;
  }
);

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

// TODO(@darzu): BUG!! We have two versions of host, resource and component!
export const HostDef = EM.defineResource("host", () => true);
export const HostCompDef = EM.defineComponent("host", () => true);

export const AuthorityDef = EM.defineComponent(
  "authority",
  () => ({
    pid: 0,
    seq: 0,
    updateSeq: 0,
  }),
  (p, pid?: number) => {
    if (pid !== undefined) p.pid = pid;
    return p;
  }
);

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

export const PeerNameDef = EM.defineResource("peerName", (name?: string) => ({
  name: name || "",
}));

export type PeerName = Resource<typeof PeerNameDef>;

export const MeDef = EM.defineResource(
  "me",
  (pid?: number, host?: boolean) => ({
    pid: pid || 1,
    host: host || false,
  })
);

export type Me = Resource<typeof MeDef>;

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

export const NetStatsDef = EM.defineResource("netStats", () => ({
  skewEstimate: {} as Record<string, number>,
  pingEstimate: {} as Record<string, number>,
}));

export type NetStats = Component<typeof NetStatsDef>;

export const EventsFromNetworkDef = EM.defineResource(
  "eventsFromNetwork",
  () => [] as FromNetworkEvent[]
);

export type EventsFromNetwork = Component<typeof EventsFromNetworkDef>;

export const EventsToNetworkDef = EM.defineResource(
  "eventsToNetwork",
  () => [] as ToNetworkEvent[]
);

export type EventsToNetwork = Component<typeof EventsToNetworkDef>;

export const NetworkReadyDef = EM.defineResource("networkReady", () => true);
export const JoinDef = EM.defineResource("join", (address: string) => ({
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
