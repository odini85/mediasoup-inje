import { roomManager, userManager } from "./store";
import debugModule from "debug";
import injeMediasoup from "./module/inje-mediasoup";
import config from "./config";
import { decodePeerId } from "./utils";
import { TRANSPORT_DIRECTION } from "./constant";

const log = debugModule("demo-app");
const warn = debugModule("demo-app:WARN");
const err = debugModule("demo-app:ERROR");

export function registerRouter(expressApp) {
  // room 생성
  expressApp.get("/room/create", async (req, res) => {
    const user = userManager.getUser(req.cookies.userId);
    const room = roomManager.createRoom(user);
    const roomId = room.getId();

    res.send({ roomId });
  });

  // room producers 목록 반환
  expressApp.get("/room/:roomId/producers", async (req, res) => {
    const { roomId } = req.params;
    const room = roomManager.getRoom(roomId);
    if (!room) {
      res.render("lobby");
      return;
    }

    const producers = room.getProducersVo();

    res.send({
      producers,
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

      debugger;
      res.send({ id: producer.id });
    } catch (e) {}
  });

  // --> /signaling/recv-track
  // mediasoup consumer 객체를 만들고 서버의 producer에 연결하고
  // consumer를 만드는 데 필요한 정보를 다시 보낸다.
  // 클라이언트 측의 객체는 항상 consumer를 일시 중지로 시작합니다.
  // 클라이언트는 연결이 완료되면 미디어 재개를 요청한다.
  expressApp.post("/signaling/recv-track", async (req, res) => {
    try {
      const { peerId, mediaPeerId, mediaTag, rtpCapabilities } = req.body;
      const { roomId } = decodePeerId(peerId);
      const room = roomManager.getRoom(roomId);

      const peer = room.getPeer(peerId);
      const producerPeer = room.getPeer(mediaPeerId);
      const producer = producerPeer.getProducer();

      // const producer = roomState.producers.find(
      //   (p) => p.appData.mediaTag === mediaTag && p.appData.peerId === mediaPeerId
      // );

      if (!producer) {
        const msg =
          "server-side producer for " + `${mediaPeerId}:${mediaTag} not found`;
        // err("recv-track: " + msg);
        res.send({ error: msg });
        return;
      }

      const mediasoupRouter = injeMediasoup.getMediasoupRouter();
      if (
        !mediasoupRouter.canConsume({
          producerId: producer.id,
          rtpCapabilities,
        })
      ) {
        const msg = `client cannot consume ${mediaPeerId}:${mediaTag}`;
        // err(`recv-track: ${peerId} ${msg}`);
        res.send({ error: msg });
        return;
      }

      const transport = peer.getTransportOfDirection(
        TRANSPORT_DIRECTION.RECEIVE
      );
      // const transport = Object.values(roomState.transports).find(
      //   (t) => t.appData.peerId === peerId && t.appData.clientDirection === "recv"
      // );

      if (!transport) {
        const msg = `server-side recv transport for ${peerId} not found`;
        // err("recv-track: " + msg);
        res.send({ error: msg });
        return;
      }

      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: true, // 항상 일시 중지 시작에 대한 위의 참고 사항을 참조
        appData: { peerId, mediaPeerId, mediaTag },
      });

      // 모든 상황에서 consumer를 닫고 정리하려면
      // 'transportclose' 및 'producerclose' 이벤트 핸들러에서 처리한다.
      consumer.on("transportclose", () => {
        console.log(">>>>>>>>> transportclose");
        // log(`consumer's transport closed`, consumer.id);
        // closeConsumer(consumer);
      });
      consumer.on("producerclose", () => {
        console.log(">>>>>>>>> producerclose");
        // log(`consumer's producer closed`, consumer.id);
        // closeConsumer(consumer);
      });

      // consumer를 consumers에 추가하여 추적하고
      // 이 consumer의 클라이언트 관련 상태를 추적하는 데이터 구조를 만든다.
      // roomState.consumers.push(consumer);
      // roomState.peers[peerId].consumerLayers[consumer.id] = {
      //   currentLayer: null,
      //   clientSelectedLayer: null,
      // };

      console.log(">> consumer.id", consumer.id);
      peer.addConsumer(consumer);

      res.send({
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      });
    } catch (e) {
      console.error("error in /signaling/recv-track", e);
      res.send({ error: e });
    }
  });

  // 특정 클라이언트에 대한 track 수신을 재개하기 위해 호출된다.
  expressApp.post("/signaling/resume-consumer", async (req, res) => {
    try {
      const { peerId, consumerId } = req.body;

      const { roomId } = decodePeerId(peerId);
      const room = roomManager.getRoom(roomId);
      const peer = room.getPeer(peerId);
      const consumer = peer.getConsumer(consumerId);
      // consumer = roomState.consumers.find((c) => c.id === consumerId);

      if (!consumer) {
        // err(`pause-consumer: server-side consumer ${consumerId} not found`);
        res.send({ error: `server-side consumer ${consumerId} not found` });
        return;
      }

      // log("resume-consumer", consumer.appData);

      await consumer.resume();

      res.send({ resumed: true });
    } catch (e) {
      console.error("error in /signaling/resume-consumer", e);
      res.send({ error: e });
    }
  });
}
