import { roomManager, userManager } from "./store";
import debugModule from "debug";
import injeMediasoup from "./module/inje-mediasoup";
import config from "./config";

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

  // roomState 데이터 구조에 peer를 추가하고 peer가 미디어를 수신하는 데 사용할 transport를 만든다.
  // mediasoup-client device 초기화를 위한 라우터 rtpCapabilities를 반환한다.
  expressApp.get("/signaling/router-rtp-capabilities", async (req, res) => {
    try {
      const routerRtpCapabilities =
        injeMediasoup.getMediasoupRouter().rtpCapabilities;

      res.send({ routerRtpCapabilities });
    } catch (e) {
      console.error("error in /signaling/join-as-new-peer", e);
      res.send({ error: e });
    }
  });

  // mediasoup transport 객체를 만들고
  // 클라이언트에서 transport 객체를 만드는 데 필요한 정보를 반환한다.
  expressApp.post("/signaling/create-transport", async (req, res) => {
    try {
      const { roomId, peerId, direction } = req.body;
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

      const room = roomManager.getRoom(roomId);
      room.setTransport(transport);

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

  // 클라이언트의 `transport.on('connect')` 이벤트 핸들러 내부에서 호출된다.
  expressApp.post("/signaling/connect-transport", async (req, res) => {
    try {
      const { roomId, peerId, transportId, dtlsParameters } = req.body;

      const room = roomManager.getRoom(roomId);
      const transport = room.getTransport(transportId);

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

  // 클라이언트의 `transport.on('produce')` 이벤트 핸들러 내부에서 호출된다.
  expressApp.post("/signaling/send-track", async (req, res) => {
    try {
      const {
        roomId,
        peerId,
        transportId,
        kind,
        rtpParameters,
        paused = false,
        appData,
      } = req.body;

      const room = roomManager.getRoom(roomId);

      const transport = room.getTransport(transportId);

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

      // producer의 오디오 레벨을 모니터링한다
      // audioLevelObserver.addProducer()를 실행했지만
      // AudioLevelObserver 가 닫힌 producers를 자동으로 제거한다.
      // 따라서 removeProducer()를 호출할 필요 없다
      if (producer.kind === "audio") {
        audioLevelObserver.addProducer({ producerId: producer.id });
      }

      room.setTransport(producer);
      const peer = room.getPeer(peerId);
      peer.media[appData.mediaTag] = {
        paused,
        encodings: rtpParameters.encodings,
      };

      res.send({ id: producer.id });
    } catch (e) {}
  });
}
