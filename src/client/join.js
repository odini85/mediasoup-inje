import InjeRTC from "./inje-rtc";

class RoomJoin {
  constructor(myPeerId) {
    // const peerId = roomId + userId;
    this._injeRTC = new InjeRTC(myPeerId);

    this.init();
    console.log("join!!");
  }
  init() {
    const cameraBtnEl = document.querySelector("#uid_camera_btn");
    const myCameraEl = document.querySelector("#uid_my_camera");

    cameraBtnEl.addEventListener("click", () => {
      console.log("cameraBtnEl");

      this._injeRTC.sendCameraStreams();
    });
  }
}

export default {
  RoomJoinClass: RoomJoin,
};
