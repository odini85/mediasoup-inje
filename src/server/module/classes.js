import { v4 as uuidv4 } from "uuid";

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }
  createRoom() {
    const room = new Room();
    this.rooms.set(room.roomId, room);

    return room;
  }
}

export const roomManager = new RoomManager();

class Room {
  constructor() {
    this.roomId = uuidv4();
    this.peers = new Map();
  }
  joinPeer() {
    const peer = new Peer();
    this.peers.set(peer.peerId, peer);
  }
}

class Peer {
  constructor() {
    this.peerId = uuidv4();
  }
}
