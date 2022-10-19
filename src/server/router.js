import { roomManager, userManager } from "./store";
import debugModule from "debug";
import injeMediasoup from "./module/inje-mediasoup";
import config from "./config";
import { decodePeerId } from "./utils";

const log = debugModule("demo-app");
const warn = debugModule("demo-app:WARN");
const err = debugModule("demo-app:ERROR");

export function registerRouter(expressApp) {
  // lobby
  expressApp.get("/lobby", (_, res) => res.render("lobby"));

  // login
  expressApp.get("/login", async (req, res) => {
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
    const user = userManager.getUser(req.cookies.userId);
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

  // mediasoup router rtp capabilities 반환
  expressApp.get("/signaling/router-rtp-capabilities", async (req, res) => {
    // roomState 데이터 구조에 peer를 추가하고 peer가 미디어를 수신하는 데 사용할 transport를 만든다.
    // mediasoup-client device 초기화를 위한 라우터 rtpCapabilities를 반환한다.
    try {
      const routerRtpCapabilities =
        injeMediasoup.getMediasoupRouter().rtpCapabilities;

      res.send({ routerRtpCapabilities });
    } catch (e) {
      console.error("error in /signaling/join-as-new-peer", e);
      res.send({ error: e });
    }
  });

  // Mediasoup transport 생성
  expressApp.post("/signaling/create-transport", async (req, res) => {
    // mediasoup transport 객체를 만들고
    // 클라이언트에서 transport 객체를 만드는 데 필요한 정보를 반환한다.
    try {
      const { peerId, direction } = req.body;
      log("create-transport", peerId, direction);

      const { listenIps, initialAvailableOutgoingBitrate } =
        config.mediasoup.webRtcTransport;
      const mediasoupRouter = injeMediasoup.getMediasoupRouter();
      const transport = await mediasoupRouter.createWebRtcTransport({
        listenIps: listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate,
        appData: { peerId, clientDirection: direction },
      });

      const { roomId } = decodePeerId(peerId);
      const room = roomManager.getRoom(roomId);
      const peer = room.getPeer(peerId);
      peer.setTransport(direction, transport);

      res.send({
        transportOptions: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });
    } catch (e) {
      console.error("error in /signaling/create-transport", e);
      res.send({ error: e });
    }
  });

  // transport 연결
  expressApp.post("/signaling/connect-transport", async (req, res) => {
    // 클라이언트의 `transport.on('connect')` 이벤트 핸들러 내부에서 호출된다.
    try {
      const { peerId, transportId, dtlsParameters } = req.body;

      const { roomId } = decodePeerId(peerId);
      const room = roomManager.getRoom(roomId);
      const peer = room.getPeer(peerId);
      const transport = peer.getTransport(transportId);

      if (!transport) {
        err(
          `connect-transport: server-side transport ${transportId} not found`
        );
        res.send({ error: `server-side transport ${transportId} not found` });
        return;
      }

      log("connect-transport", peerId, transport.appData);

      await transport.connect({ dtlsParameters });

      res.send({ connected: true });
    } catch (e) {
      console.error("error in /signaling/connect-transport", e);
      res.send({ error: e });
    }
  });

  // track 전송
  expressApp.post("/signaling/send-track", async (req, res) => {
    // 클라이언트의 `transport.on('produce')` 이벤트 핸들러 내부에서 호출된다.
    try {
      const {
        peerId,
        transportId,
        kind,
        rtpParameters,
        paused = false,
        appData,
      } = req.body;

      const { roomId } = decodePeerId(peerId);
      const room = roomManager.getRoom(roomId);
      const peer = room.getPeer(peerId);
      const transport = peer.getTransport(transportId);

      if (!transport) {
        err(`send-track: server-side transport ${transportId} not found`);
        res.send({ error: `server-side transport ${transportId} not found` });
        return;
      }

      const producer = await transport.produce({
        kind,
        rtpParameters,
        paused,
        appData: { ...appData, peerId, transportId },
      });

      // 연결된 transport 가 닫히면 서버에서도 transport를 닫는다.
      producer.on("transportclose", () => {
        log("producer's transport closed", producer.id);
        closeProducer(producer);
      });

      peer.setProducer(producer);

      peer.media[appData.mediaType] = {
        paused,
        encodings: rtpParameters.encodings,
      };

      res.send({ id: producer.id });
    } catch (e) {}
  });
}
