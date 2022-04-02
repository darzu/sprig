/*
  A drastically simplified PeerJS, with code copied liberally from PeerJS
*/
export var ServerMessageType;
(function (ServerMessageType) {
    ServerMessageType["Heartbeat"] = "HEARTBEAT";
    ServerMessageType["Candidate"] = "CANDIDATE";
    ServerMessageType["Offer"] = "OFFER";
    ServerMessageType["Answer"] = "ANSWER";
    ServerMessageType["Open"] = "OPEN";
    ServerMessageType["Error"] = "ERROR";
    ServerMessageType["IdTaken"] = "ID-TAKEN";
    ServerMessageType["InvalidKey"] = "INVALID-KEY";
    ServerMessageType["Leave"] = "LEAVE";
    ServerMessageType["Expire"] = "EXPIRE";
})(ServerMessageType || (ServerMessageType = {}));
const SERVER_HEARTBEAT_INTERVAL = 5000;
const RECONNECT_TIME = 1000;
const DEFAULT_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
            urls: "turn:0.peerjs.com:3478",
            username: "peerjs",
            credential: "peerjsp",
        },
    ],
    sdpSemantics: "unified-plan",
};
function serverUrl(id, token) {
    return `wss://0.peerjs.com:443/peerjs?key=peerjs&id=${id}&token=${token}`;
}
export class Peer {
    constructor(id) {
        this.connections = {};
        this.nextId = 0;
        this.sock = null;
        this.onopen = null;
        this.onconnection = null;
        this.id = id;
        this.connectToServer();
    }
    connectToServer() {
        // TODO: if this fails, make it possible to get a different valid id
        let sock = new WebSocket(serverUrl("sprig-" + this.id, Math.random().toString(36).substr(2)));
        sock.onmessage = (event) => {
            //console.log(event.data);
            this.handleServerMessage(JSON.parse(event.data));
        };
        let heartbeatHandle = 0;
        sock.onopen = () => {
            //console.log("Socket opened");
            // PeerJS sends a heartbeat to the server every 5 seconds--I assume the
            // server will eventually close the connection otherwise
            heartbeatHandle = setInterval(() => {
                sock.send(JSON.stringify({ type: ServerMessageType.Heartbeat }));
            }, SERVER_HEARTBEAT_INTERVAL);
            if (this.onopen) {
                this.onopen(this.id);
            }
        };
        const onclose = () => {
            console.log("Socket closed");
            if (heartbeatHandle) {
                clearInterval(heartbeatHandle);
                heartbeatHandle = 0;
            }
            // Close all connections if connection to server goes down
            Object.values(this.connections).forEach((conn) => conn.close());
            setTimeout(() => this.connectToServer(), RECONNECT_TIME);
        };
        sock.onclose = onclose;
        this.sock = sock;
    }
    async handleServerMessage(msg) {
        console.log(`Received server message of type: ${msg.type}`);
        let payload = msg.payload;
        let remotePeerId = msg.src;
        switch (msg.type) {
            case ServerMessageType.Offer: {
                let peerConnection = new RTCPeerConnection(DEFAULT_CONFIG);
                let connectionId = msg.payload.connectionId;
                this.connections[connectionId] = peerConnection;
                this.setupPeerConnection(peerConnection, remotePeerId, connectionId);
                // listen for ice candidates
                // payload.sdp should have SDP information we need to establish a connection
                let sdp = new RTCSessionDescription(payload.sdp);
                await peerConnection.setRemoteDescription(sdp);
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                //console.log("Sending answer");
                if (!this.sock) {
                    throw "no sock";
                }
                this.sock.send(JSON.stringify({
                    type: ServerMessageType.Answer,
                    payload: {
                        sdp: answer,
                        type: "data",
                        connectionId: connectionId,
                        browser: "chrome",
                    },
                    dst: remotePeerId,
                }));
                break;
            }
            case ServerMessageType.Candidate: {
                let peerConnection = this.connections[msg.payload.connectionId];
                if (!peerConnection) {
                    throw `ICE candidate for unknown connection ${msg.payload.connectionId}`;
                }
                const ice = msg.payload.candidate;
                const candidate = ice.candidate;
                const sdpMLineIndex = ice.sdpMLineIndex;
                const sdpMid = ice.sdpMid;
                //console.log(`ICE candidate is ${candidate}`);
                await peerConnection.addIceCandidate(new RTCIceCandidate({
                    sdpMid,
                    sdpMLineIndex,
                    candidate,
                }));
                break;
            }
            case ServerMessageType.Answer: {
                let peerConnection = this.connections[msg.payload.connectionId];
                if (!peerConnection) {
                    throw `ICE candidate for unknown connection ${msg.payload.connectionId}`;
                }
                let sdp = new RTCSessionDescription(payload.sdp);
                await peerConnection.setRemoteDescription(sdp);
            }
        }
    }
    setupPeerConnection(peerConnection, remotePeerId, connectionId) {
        //console.log("setting up peer connection");
        peerConnection.onicecandidate = (ev) => {
            //console.log("on ice candidate");
            if (!ev.candidate || !ev.candidate.candidate)
                return;
            //console.log(`Got ICE candidate for ${remotePeerId}`);
            if (!this.sock) {
                throw "no sock";
            }
            this.sock.send(JSON.stringify({
                type: ServerMessageType.Candidate,
                payload: {
                    candidate: ev.candidate,
                    type: "data",
                    connectionId,
                },
                dst: remotePeerId,
            }));
        };
        peerConnection.oniceconnectionstatechange = () => {
            switch (peerConnection.iceConnectionState) {
                case "completed":
                    peerConnection.onicecandidate = () => { };
                    break;
                case "failed":
                case "closed":
                case "disconnected":
                    console.log("ICE failed in some way");
                    peerConnection.close();
                    break;
            }
        };
        peerConnection.ondatachannel = (ev) => {
            //console.log("Received data channel");
            if (this.onconnection) {
                this.onconnection(remotePeerId, ev.channel);
            }
        };
    }
    async connect(peerId, reliable) {
        const peerConnection = new RTCPeerConnection(DEFAULT_CONFIG);
        peerId = "sprig-" + peerId;
        let connectionId = `${this.id}-${peerId}-${this.nextId++}`;
        this.setupPeerConnection(peerConnection, peerId, connectionId);
        const config = { ordered: false };
        if (!reliable) {
            config.maxRetransmits = 0;
        }
        const dataChannel = peerConnection.createDataChannel(reliable ? "reliable" : "unreliable", config);
        dataChannel.binaryType = "arraybuffer";
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        this.connections[connectionId] = peerConnection;
        let payload = {
            sdp: offer,
            type: "data",
            connectionId,
            browser: "chrome",
        };
        if (!this.sock) {
            throw "no sock";
        }
        this.sock.send(JSON.stringify({
            type: ServerMessageType.Offer,
            payload,
            dst: peerId,
        }));
        return new Promise((resolve, reject) => {
            dataChannel.onopen = () => {
                resolve(dataChannel);
            };
            dataChannel.onerror = (ev) => {
                reject(ev);
            };
        });
    }
}
//# sourceMappingURL=peer.js.map