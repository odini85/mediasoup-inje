import { v4 as uuidv4 } from "uuid";
import { ProducerVo } from "./Producer";

export class RoomManager {
  constructor() {
    this._rooms = new Map();
  }
  createRoom(user) {
    const room = new Room(uuidv4(), user);
    this._rooms.set(room.getId(), room);

    return room;
  }
  getRoom(roomId) {
    return this._rooms.get(roomId);
  }
  getRooms() {
    return [...this._rooms.values()].map((room) => {
      return {
        roomId: room.getId(),
        peerCount: room.getPeers().length,
      };
    });
  }
}

/**
 * 룸 접근 peer관리
 */
class Room {
  constructor(id, user) {
    this._id = id;
    this._hostUser = user;
    this._peers = new Map();
  }
  getId() {
    return this._id;
  }
  joinPeer(user) {
    const peerId = `${this.getId()}.${user.getId()}`;
    const peer = new Peer(peerId);
    peer.setUser(user);
    this._peers.set(peerId, peer);

    return peer;
  }
  getHostUser() {
    return this._hostUser;
  }
  getPeers() {
    return [...this._peers.values()];
  }
  getPeersVo() {
    return this.getPeers().map((peer) => {
      return peer.getVo();
    });
  }
  // produce 중인 peers 반환
  getProducersVo() {
    const returnValue = [];
    this._peers.forEach((peer, key) => {
      const producer = peer.getProducer();
      if (producer && !producer.closed && !producer.paused) {
        returnValue.push(new ProducerVo(peer));
      }
    });

    return returnValue;
  }
  getPeer(peerId) {
    return this._peers.get(peerId);
  }
}
