import { v4 as uuidv4 } from "uuid";
import { MEDIA_TYPE, TRANSPORT_DIRECTION } from "../constant";

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
        returnValue.push(new ProducerInfoVo(peer));
      }
    });

    return returnValue;
  }
  getPeer(peerId) {
    return this._peers.get(peerId);
  }
}

class ProducerInfoVo {
  constructor(peer) {
    const producer = peer.getProducer();

    this.peerId = peer.getId();
    this.id = producer.id;
    this.paused = producer.paused;
    this.closed = producer.closed;
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

class User {
  constructor(id) {
    this._id = id;
  }
  getId() {
    return this._id;
  }
  getVo() {
    return new UserVo(this);
  }
}

class UserVo {
  constructor(user) {
    this.id = user.getId();
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
    this._transport = {
      [TRANSPORT_DIRECTION.SEND]: null,
      [TRANSPORT_DIRECTION.RECEIVE]: null,
    };
    this._producer = null;
    this._consumers = new Map();
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
  setTransport(direction, transport) {
    this._transport[direction] = transport;
    this._transport[transport.id] = transport;
  }
  getTransportOfDirection(direction) {
    return this._transport[direction];
  }
  getTransport(transportId) {
    return this._transport[transportId];
  }
  setProducer(producer) {
    this._producer = producer;
  }
  getProducer() {
    return this._producer;
  }
  addConsumer(consumer) {
    this._consumers.set(consumer.id, consumer);
  }
  getConsumer(consumerId) {
    return this._consumers.get(consumerId);
  }
  getVo() {
    return new PeerVo(this);
  }
}

class PeerVo {
  constructor(peer) {
    this.id = peer.getId();
    this.user = peer.getUser().getVo();
  }
}
