import { roomCreateAPI } from "./apis";

class Lobby {
  constructor() {
    this.init();
    console.log("lobby!!");
  }
  init() {
    const btnCreateRoomEl = document.querySelector("#uid_create_room");

    btnCreateRoomEl.addEventListener("click", async () => {
      const res = await roomCreateAPI();
      const { roomId } = res.data;

      window.location.href = `/room/join/${roomId}`;
    });
  }
}

const lobby = new Lobby();
export default lobby;
