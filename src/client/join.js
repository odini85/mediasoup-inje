import InjeRTC from "./inje-rtc";
import { MEDIA_TYPE } from "./constant";
import { getPeersByRoomId } from "./apis";
import { decodePeerId } from "./utils";
import { listenerCount } from "ws";
class RoomJoin {
  constructor(myPeerId) {
    // const peerId = roomId + userId;
    const { roomId, userId } = decodePeerId(myPeerId);
    this._roomId = roomId;
    this._userId = userId;
    this._peers = null;
    this._injeRTC = new InjeRTC(myPeerId);
    this._producers = new Producers();
    this._peers = new Peers();

    this.init();
    console.log("join!!");
  }
  init() {
    const cameraBtnEl = document.querySelector("#uid_camera_btn");
    const myCameraEl = document.querySelector("#uid_my_camera");

    cameraBtnEl.addEventListener("click", () => {
      console.log("cameraBtnEl");

      this._injeRTC.produce(MEDIA_TYPE.CAM_VIDEO);
    });

    const roomPeersBtnEl = document.querySelector("#uid_room_peers_btn");
    roomPeersBtnEl.addEventListener("click", () => {
      this.displayRoomPeersList();
    });
  }

  // room 참여자 그리기
  async displayRoomPeersList() {
    const roomPeersListEl = document.querySelector("#uid_room_peers_list");
    const response = await getPeersByRoomId(this._roomId);
    console.log(">>>", response.producers);

    this._peers.addList(response.peers);
    this._producers.addList(response.producers);

    const peerList = this._peers.getList();

    // const markup = peerList
    //   .map((peer) => {
    //     const producer = this._producers.getProducerByPeerId(peer.id);
    //     return `<li data-id="${peer.id}">
    //       ${JSON.stringify(peer)}
    //       <video class="peer-video ${
    //         producer?.paused ? "is-paused" : ""
    //       }" playsinline />
    //     </li>`;
    //   })
    //   .join("");
    // roomPeersListEl.innerHTML = markup;

    this._consumePeers(this._producers);
  }

  // producers consume
  async _consumePeers(producers) {
    for (const producer of producers.getList()) {
      if (!producer.consume) {
        producer.consume = await this._injeRTC.consume(
          MEDIA_TYPE.CAM_VIDEO,
          producer.peerId
        );
      }
    }

    // producers.getList().forEach(async (producer) => {
    //   if (!producer.consume) {
    //     producer.consume = await this._injeRTC.consume(
    //       MEDIA_TYPE.CAM_VIDEO,
    //       producer.peerId
    //     );
    //   } else {
    //     // const peerId = producer.peerId;
    //     // const consumer = producer.consume;
    //     // const wrapperEl = document.querySelector(`*[data-id='${peerId}']`);
    //     // console.log({ wrapperEl, peerId });
    //     // const videoEl = wrapperEl.querySelector("video");
    //     // videoEl.setAttribute("playsinline", true);
    //     // videoEl.srcObject = new MediaStream([consumer.track.clone()]);
    //     // videoEl
    //     //   .play()
    //     //   .then(() => {})
    //     //   .catch((e) => {
    //     //     console.error(e);
    //     //   });
    //   }
    // });
  }
}

class Producers {
  constructor(producers = []) {
    this._map = new Map();
    this._mapByPeerId = new Map();
    this._list = producers;
    this.addList(producers);
  }
  addList(producers) {
    producers.forEach((producer) => {
      if (!this._map.has(producer.id)) {
        this._map.set(producer.id, producer);
        this._mapByPeerId.set(producer.peerId, producer);
        this._list.push(producer);
      }
    });
  }
  getProducer(producerId) {
    return this._map.get(producerId);
  }
  getProducerByPeerId(peerId) {
    return this._mapByPeerId.get(peerId);
  }
  getList() {
    return this._list;
  }
}

class Peers {
  constructor(peers = []) {
    this._map = new Map();
    this._list = peers;
    this.addList(peers);
  }
  addList(peers) {
    peers.forEach((peer) => {
      if (!this._map.has(peer.id)) {
        this._map.set(peer.id, peer);
        this._list.push(peer);
      }
    });
  }
  getPeer(peerId) {
    return this._map.get(peerId);
  }
  getList() {
    return this._list;
  }
}

export default {
  RoomJoinClass: RoomJoin,
};
