import { v4 as uuidv4 } from "uuid";

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

class Room {
  constructor(id, user) {
    this._id = id;
    this._hostUser = user;
    this._peers = new Map();
    this._transports = new Map();
    this._producers = new Map();
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
  getPeer(peerId) {
    return this._peers.get(peerId);
  }
  getTransport(transportId) {
    return this._transports.get(transportId);
  }
  setTransport(transport) {
    this._transports.set(transport.id, transport);
  }
  getProducer(producerId) {
    return this._producers.get(producerId);
  }
  setProducer(producer) {
    this._producers.set(producer.id, producer);
  }
}

export class UserManager {
  constructor() {
    this._users = new Map();
  }
  createUser() {
    const user = new User(uuidv4());
    this._users.set(user.getId(), user);

    return user;
  }
  getUser(userId) {
    return this._users.get(userId);
  }
}

export class Peer {
  constructor(id) {
    this._id = id;
    this._user = null;
    const now = Date.now();
    this._mediasoup = {
      joinTs: now,
      lastSeenTs: now,
      media: {},
      consumerLayers: {},
      stats: {},
    };
  }
  getId() {
    return this._id;
  }
  setUser(user) {
    this._user = user;
  }
  getUser() {
    return this._user;
  }
}

class User {
  constructor(id) {
    this._id = id;
  }
  getId() {
    return this._id;
  }
}
