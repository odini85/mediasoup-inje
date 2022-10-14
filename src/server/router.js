import { roomManager, userManager } from "./store";
import debugModule from "debug";

const log = debugModule("demo-app");
const warn = debugModule("demo-app:WARN");
const err = debugModule("demo-app:ERROR");

export function registerRouter(expressApp) {
  // lobby
  expressApp.get("/lobby", (_, res) => res.render("lobby"));

  // login
  expressApp.get("/login", async (req, res) => {
    console.log("????", userManager);
    console.log(">>> /login");
    const user = userManager.createUser();
    const userId = user.getId();

    res.cookie("userId", userId, {
      maxAge: 1000 * 60 * 60 * 24,
      // httpOnly: true,
    });

    res.send({ userId });
  });

  // room 생성
  expressApp.get("/room/create", async (req, res) => {
    console.log(">>> /room/create");
    const user = userManager.getUser(req.cookies.userId);
    console.log(">>>", req.cookies, user);
    const room = roomManager.createRoom(user);
    const roomId = room.getId();

    res.send({ roomId });
  });

  // room 참여
  expressApp.get("/room/join/:roomId", async (req, res) => {
    const { roomId } = req.params;
    const userId = req.cookies.userId;
    const room = roomManager.getRoom(roomId);
    const user = userManager.getUser(userId);

    console.log("room >>>", room);

    const peer = room.joinPeer(user);
    const peers = room.getPeers();
    const hostUser = room.getHostUser();

    res.render("room/join", {
      roomId,
      userId,
      hostUser,
      peers,
      peerId: peer.getId(),
    });
  });

  // room 목록
  expressApp.get("/room/list", async (req, res) => {
    res.send(roomManager.getRooms());
  });

  // 쿠키 생성 샘플
  expressApp.get("/create-cookie", (_, res) => {
    res.cookie(
      "COOKIE_NAME",
      {
        seq: 0,
        name: "odin",
        gender: "Male",
        age: 30,
      },
      {
        maxAge: 1000 * 60 * 3,
        httpOnly: true,
      }
    );
    res.send("쿠키 생성완료!!");
  });

  // roomState 데이터 구조에 peer를 추가하고 peer가 미디어를 수신하는 데 사용할 transport를 만든다.
  // mediasoup-client device 초기화를 위한 라우터 rtpCapabilities를 반환한다.
  expressApp.get("/signaling/router-rtp-capabilities", async (req, res) => {
    try {
      res.send({ routerRtpCapabilities: router.rtpCapabilities });
    } catch (e) {
      console.error("error in /signaling/join-as-new-peer", e);
      res.send({ error: e });
    }
  });
}
