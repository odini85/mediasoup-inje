import { v4 as uuidv4 } from "uuid";
import { MEDIA_TYPE, TRANSPORT_DIRECTION } from "../constant";

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
