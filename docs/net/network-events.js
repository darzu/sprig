export var NetworkEventType;
(function (NetworkEventType) {
    NetworkEventType[NetworkEventType["Ready"] = 0] = "Ready";
    NetworkEventType[NetworkEventType["NewConnection"] = 1] = "NewConnection";
    NetworkEventType[NetworkEventType["MessageRecv"] = 2] = "MessageRecv";
    NetworkEventType[NetworkEventType["MessageSend"] = 3] = "MessageSend";
    NetworkEventType[NetworkEventType["Connect"] = 4] = "Connect";
    // TODO: close connection?
})(NetworkEventType || (NetworkEventType = {}));
//# sourceMappingURL=network-events.js.map