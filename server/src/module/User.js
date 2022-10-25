import { v4 as uuidv4 } from "uuid";

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
