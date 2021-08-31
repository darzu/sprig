/*
  A drastically simplified PeerJS, with code copied liberally from PeerJS
*/
export enum ServerMessageType {
  Heartbeat = "HEARTBEAT",
  Candidate = "CANDIDATE",
  Offer = "OFFER",
  Answer = "ANSWER",
  Open = "OPEN", // The connection to the server is open.
  Error = "ERROR", // Server error.
  IdTaken = "ID-TAKEN", // The selected ID is taken.
  InvalidKey = "INVALID-KEY", // The given API key cannot be found.
  Leave = "LEAVE", // Another peer has closed its connection to this peer.
  Expire = "EXPIRE", // The offer sent to a peer has expired without response.
}

interface ServerMessage {
  type: ServerMessageType;
  payload: any;
  src: string;
}

const SERVER_HEARTBEAT_INTERVAL = 5000;

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

function serverUrl(id: string, token: string) {
  return `wss://0.peerjs.com:443/peerjs?key=peerjs&id=${id}&token=${token}`;
}

async function getId() {
  const response = await fetch(
    `https://0.peerjs.com:443/peerjs/id?ts=${
      new Date().getTime() + "" + Math.random()
    }`
  );
  return response.text();
}

export class Peer {
  connections: Record<string, RTCPeerConnection> = {};
  nextId: number = 0;
  sock: WebSocket | null = null;
  id: string | null = null;
  onopen: ((id: string) => void) | null = null;
  onconnection: ((peerId: string, channel: RTCDataChannel) => void) | null =
    null;

  constructor() {
    getId().then((id) => {
      this.id = id;
      let sock = new WebSocket(
        serverUrl(id, Math.random().toString(36).substr(2))
      );
      sock.onmessage = (event) => {
        this.handleServerMessage(JSON.parse(event.data));
      };

      sock.onopen = () => {
        //console.log("Socket opened");
        // PeerJS sends a heartbeat to the server every 5 seconds--I assume the
        // server will eventually close the connection otherwise
        setInterval(
          () =>
            sock.send(JSON.stringify({ type: ServerMessageType.Heartbeat })),
          SERVER_HEARTBEAT_INTERVAL
        );
        if (this.onopen) {
          this.onopen(id);
        }
      };
      sock.onclose = () => {
        console.log("Socket closed");
      };
      this.sock = sock;
    });
  }

  private setupPeerConnection(
    peerConnection: RTCPeerConnection,
    remotePeerId: string,
    connectionId: string
  ) {
    console.log("setting up peer connection");
    peerConnection.onicecandidate = (ev) => {
      console.log("on ice candidate");
      if (!ev.candidate || !ev.candidate.candidate) return;
      //console.log(`Got ICE candidate for ${remotePeerId}`);
      if (!this.sock) {
        throw "no sock";
      }
      this.sock.send(
        JSON.stringify({
          type: ServerMessageType.Candidate,
          payload: {
            candidate: ev.candidate,
            type: "data",
            connectionId,
          },
          dst: remotePeerId,
        })
      );
    };

    peerConnection.oniceconnectionstatechange = () => {
      switch (peerConnection.iceConnectionState) {
        case "completed":
          peerConnection.onicecandidate = () => {};
          break;
        case "failed":
        case "closed":
        case "disconnected":
          console.log("ICE failed in some way");
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

  private async handleServerMessage(msg: ServerMessage) {
    //console.log(`Received message of type: ${msg.type}`);
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
        this.sock.send(
          JSON.stringify({
            type: ServerMessageType.Answer,
            payload: {
              sdp: answer,
              type: "data",
              connectionId: connectionId,
              browser: "chrome",
            },
            dst: remotePeerId,
          })
        );
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
        await peerConnection.addIceCandidate(
          new RTCIceCandidate({
            sdpMid,
            sdpMLineIndex,
            candidate,
          })
        );
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

  async connect(peerId: string, reliable: boolean): Promise<RTCDataChannel> {
    const peerConnection = new RTCPeerConnection(DEFAULT_CONFIG);
    let connectionId = `${this.id}-${peerId}-${this.nextId++}`;
    this.setupPeerConnection(peerConnection, peerId, connectionId);
    const config: RTCDataChannelInit = { ordered: false };
    if (!reliable) {
      config.maxRetransmits = 0;
    }
    const dataChannel = peerConnection.createDataChannel(
      reliable ? "reliable" : "unreliable",
      config
    );
    dataChannel.binaryType = "arraybuffer";
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    this.connections[connectionId] = peerConnection;
    let payload: any = {
      sdp: offer,
      type: "data",
      connectionId,
      browser: "chrome",
    };
    if (!this.sock) {
      throw "no sock";
    }
    this.sock.send(
      JSON.stringify({
        type: ServerMessageType.Offer,
        payload,
        dst: peerId,
      })
    );
    return new Promise((resolve, reject) => {
      dataChannel.onopen = () => {
        resolve(dataChannel);
      };
      dataChannel.onerror = (ev) => {
        reject(ev.error);
      };
    });
  }
}
