import { loginAPI, roomCreateAPI, roomListAPI } from "./apis";

class Lobby {
  constructor() {
    this.init();
    this.displayUserId();
    this.displayRoomList();
    console.log("lobby!!");
  }
  init() {
    // 방 생성
    const btnCreateRoomEl = document.querySelector("#uid_create_room_btn");
    btnCreateRoomEl.addEventListener("click", async () => {
      const { roomId } = await roomCreateAPI();

      window.location.href = `/room/join/${roomId}`;
    });

    // 로그인
    const btnLoginEl = document.querySelector("#uid_login_btn");
    btnLoginEl.addEventListener("click", async () => {
      const res = await loginAPI();
      console.log("login res", res);
      this.displayUserId();
    });

    // 카메라 테스트
    const cameraBtnEl = document.querySelector("#uid_camera_btn");
    const myCameraEl = document.querySelector("#uid_my_camera");

    cameraBtnEl.addEventListener("click", () => {
      console.log("cameraBtnEl");
      this.previewCamera(myCameraEl);
    });
  }

  // 카메라 미리보기
  async previewCamera(videoEl) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    videoEl.srcObject = stream;
    videoEl.setAttribute("playsinline", true);
    videoEl.play();
  }

  displayUserId() {
    const loginIdEl = document.querySelector("#uid_user_id");
    // cookieName = userId
    const loginId = document.cookie;
    loginIdEl.innerHTML = loginId;
  }
  async displayRoomList() {
    const response = await roomListAPI();
    console.log(response);

    const html = response
      .map(
        ({ roomId, userCount }) =>
          `<a href="/room/join/${roomId}">${roomId} : ${userCount}</a><br />`
      )
      .join("");
    const container = document.querySelector("#uid_room_list");
    container.innerHTML = html;
  }
}

const lobby = new Lobby();
export default lobby;
