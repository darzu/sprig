import { EM } from "../entity-manager.js";
export const SyncDef = EM.defineComponent("sync", (full, dynamic) => ({
    priorityIncrementFull: 1000,
    priorityIncrementDynamic: 10,
    fullComponents: full !== null && full !== void 0 ? full : [],
    dynamicComponents: dynamic !== null && dynamic !== void 0 ? dynamic : [],
}));
export const PeerDef = EM.defineComponent("peer", () => ({
    address: "",
    // TODO: consider moving this state to another component
    joined: false,
    pid: 0,
    updateSeq: 0,
    entityPriorities: new Map(),
    entitiesKnown: new Set(),
    entitiesInUpdate: new Map(),
}));
export const HostDef = EM.defineComponent("host", () => true);
export const AuthorityDef = EM.defineComponent("authority", (pid) => ({
    pid: pid || 0,
    seq: 0,
    updateSeq: 0,
}));
export function claimAuthority(authority, pid, seq, updateSeq) {
    if ((authority.updateSeq <= updateSeq &&
        authority.seq <= seq &&
        authority.pid === pid) ||
        authority.seq < seq ||
        (authority.seq === seq && pid < authority.pid)) {
        authority.pid = pid;
        authority.seq = seq;
        authority.updateSeq = updateSeq;
        return true;
    }
    return false;
}
export const PeerNameDef = EM.defineComponent("peerName", (name) => ({
    name: name || "",
}));
export const MeDef = EM.defineComponent("me", (pid, host) => ({
    pid: pid || 1,
    host: host || false,
}));
export const InboxDef = EM.defineComponent("inbox", () => new Map());
export const OutboxDef = EM.defineComponent("outbox", () => []);
export function send(outbox, buffer) {
    outbox.push(buffer);
}
export const NetStatsDef = EM.defineComponent("netStats", () => ({
    skewEstimate: {},
    pingEstimate: {},
}));
export const EventsFromNetworkDef = EM.defineComponent("eventsFromNetwork", () => []);
export const EventsToNetworkDef = EM.defineComponent("eventsToNetwork", () => []);
export const NetworkReadyDef = EM.defineComponent("networkReady", () => true);
export const JoinDef = EM.defineComponent("join", (address) => ({
    address,
    state: "start",
    lastSendTime: 0,
}));
// This component should be present on entities that want to participate in the
// prediction system
export const PredictDef = EM.defineComponent("predict", () => ({
    dt: 0,
}));
//# sourceMappingURL=components.js.map