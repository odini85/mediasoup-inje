import express from "express";
import * as mediasoup from "mediasoup";
import https from "https";
import debugModule from "debug";
import config from "./config";
import createCertificate from "./createCertificate";

const log = debugModule("demo-app");
const warn = debugModule("demo-app:WARN");
const err = debugModule("demo-app:ERROR");
const expressApp = express();

expressApp.set("view engine", "pug");
expressApp.set("views", __dirname + "/views");
expressApp.use("/public", express.static(__dirname + "/public"));
expressApp.get("/", (_, res) => res.render("sender"));
expressApp.get("/receiver", (_, res) => res.render("receiver"));
expressApp.get("/*", (_, res) => res.redirect("/"));
expressApp.use(express.json({ type: "*/*" }));

// 하나의 mediasoup worker, router, room 생성

let httpsServer;
let worker;
let router;
let audioLevelObserver;

const roomState = {
  // 외부 용
  peers: {},
  activeSpeaker: { producerId: null, volume: null, peerId: null },
  // 내부 용
  transports: {},
  producers: [],
  consumers: [],
};

/*
  연결하는 각 피어에 대해 피어 테이블을 유지하고 트랙을 통해 무언가를 주고 받는다.
  또한 네트워크 문제가 있는 클라이언트의 연결을 끊을 수 있도록 피어가 마지막 사용한 시간을 알아야 한다.

  이 간단한 데모에서 각 클라이언트는 1초마다 서버에 폴링하고 서버는 roomState를 응답한다.
  각 폴링 요청에 대한 응답으로 아래와 같은 peers 데이터 구조를 사용한다.

  {
    [peerId] : {
      joinTs: <ms timestamp>
      lastSeenTs: <ms timestamp>
      media: {
        [mediaTag] : {
          paused: <bool>
          encodings: []
        }
      },
      stats: {
        producers: {
          [producerId]: {
            ...(selected producer stats)
          }
        consumers: {
          [consumerId]: { ...(selected consumer stats) }
        }
      }
      consumerLayers: {
        [consumerId]:
            currentLayer,
            clientSelectedLayer,
          }
        }
      }
    }
  }

  또한 audioLevelObserver에서 추적한 활성화된 발언자에 대한 정보도 보낸다.

  서버에는 transport, producer 및 consumer 목록을 관리한다.

  transport, producer 또는 consumer를 만들 때마다 remote peerId를 개체의 'appData'에 저장한다.
  producer와 consumer를 위해 서버는 클라이언트에 "media tag"를 추적하여 track을 서로 연관시킨다.

*/

//
// main() -- 실행 진입 점
//

async function main() {
  // mediasoup 시작
  console.log("starting mediasoup");
  const res = await startMediasoup();

  worker = res.worker;
  router = res.router;
  audioLevelObserver = res.audioLevelObserver;

  // https server 서버 시작, 실패시 http 서버로 대체
  console.log("starting express");
  try {
    const pem = createCertificate([{ name: "commonName", value: "localhost" }]);
    const tlsFromPem = {
      cert: Buffer.from(pem.cert),
      key: Buffer.from(pem.private),
    };

    httpsServer = https.createServer(tlsFromPem, expressApp);

    httpsServer.on("error", (e) => {
      console.error("https server error,", e.message);
    });

    await new Promise((resolve) => {
      httpsServer.listen(config.httpPort, config.httpIp, () => {
        console.log(
          `server is running and listening on ` +
            `https://${config.httpIp}:${config.httpPort}`
        );
        resolve();
      });
    });
  } catch (e) {
    if (e.code === "ENOENT") {
      console.error("no certificates found (check config.js)");
      console.error("  could not start https server ... trying http");
    } else {
      err("could not start https server", e);
    }
    expressApp.listen(config.httpPort, config.httpIp, () => {
      console.log(`http server listening on port ${config.httpPort}`);
    });
  }

  // 서버에 종료 요청을 보내지 않고 끊긴 peer 정리를 주기적으로 정리하기 위함.
  // 마지막 요청은 beacon활용
  setInterval(() => {
    let now = Date.now();
    Object.entries(roomState.peers).forEach(([id, p]) => {
      if (now - p.lastSeenTs > config.httpPeerStale) {
        warn(`removing stale peer ${id}`);
        closePeer(id);
      }
    });
  }, 1000);

  // peer 들에게보내는 비디오 통계를 주기적으로 업데이트
  setInterval(updatePeerStats, 3000);
}

main();

//
// 단일 worker, router로 mediasoup 시작
//

async function startMediasoup() {
  let worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  });

  worker.on("died", () => {
    console.error("mediasoup worker died (this should never happen)");
    process.exit(1);
  });

  const mediaCodecs = config.mediasoup.router.mediaCodecs;
  const router = await worker.createRouter({ mediaCodecs });

  // 활성화 된 스피커 신호를 위한 audioLevelObserver
  const audioLevelObserver = await router.createAudioLevelObserver({
    interval: 800,
  });
  audioLevelObserver.on("volumes", (volumes) => {
    const { producer, volume } = volumes[0];
    log("audio-level volumes event", producer.appData.peerId, volume);
    roomState.activeSpeaker.producerId = producer.id;
    roomState.activeSpeaker.volume = volume;
    roomState.activeSpeaker.peerId = producer.appData.peerId;
  });
  audioLevelObserver.on("silence", () => {
    log("audio-level silence event");
    roomState.activeSpeaker.producerId = null;
    roomState.activeSpeaker.volume = null;
    roomState.activeSpeaker.peerId = null;
  });

  return { worker, router, audioLevelObserver };
}

//
// -- signaling은 http polling방식 사용 --
//

// 'peers' 데이터 구조와 'activeSpeaker' 정보를 다시 전달한다
expressApp.post("/signaling/sync", async (req, res) => {
  let { peerId } = req.body;
  try {
    // 요청 받은 peer가 연결되어 있는지 확인한다.
    // 네트워크 중단으로 인해 peer의 연결이 끊은 경우 peer가 반환할 때 발생했음을 알린다.
    if (!roomState.peers[peerId]) {
      throw new Error("not connected");
    }

    // 가장 최근 보낸 timestamp를 갱신한다.(오래된 요청 확인 용)
    roomState.peers[peerId].lastSeenTs = Date.now();

    res.send({
      peers: roomState.peers,
      activeSpeaker: roomState.activeSpeaker,
    });
  } catch (e) {
    console.error(e.message);
    res.send({ error: e.message });
  }
});

// roomState 데이터 구조에 peer를 추가하고 peer가 미디어를 수신하는 데 사용할 transport를 만든다.
// mediasoup-client device 초기화를 위한 라우터 rtpCapabilities를 반환한다.
expressApp.post("/signaling/join-as-new-peer", async (req, res) => {
  try {
    let { peerId } = req.body,
      now = Date.now();
    log("join-as-new-peer", peerId);

    roomState.peers[peerId] = {
      joinTs: now,
      lastSeenTs: now,
      media: {},
      consumerLayers: {},
      stats: {},
    };

    res.send({ routerRtpCapabilities: router.rtpCapabilities });
  } catch (e) {
    console.error("error in /signaling/join-as-new-peer", e);
    res.send({ error: e });
  }
});

function closePeer(peerId) {
  log("closing peer", peerId);
  for (let [id, transport] of Object.entries(roomState.transports)) {
    if (transport.appData.peerId === peerId) {
      closeTransport(transport);
    }
  }
  delete roomState.peers[peerId];
}

async function closeTransport(transport) {
  try {
    log("closing transport", transport.id, transport.appData);

    // producer, consumer 이벤트 핸들러는
    // 이 transport와 관련된 모든 producers, consumer에 대해
    // closeProducer(), closeConsumer() 호출을 처리한다.
    await transport.close();

    // 따라서 transport.close() 호출 후 roomState 데이터 구조를 업데이트한다.
    delete roomState.transports[transport.id];
  } catch (e) {
    err(e);
  }
}

async function closeProducer(producer) {
  log("closing producer", producer.id, producer.appData);
  try {
    await producer.close();

    // roomState.producers 목록에서 전달받은 producer를 제거한다.
    roomState.producers = roomState.producers.filter(
      (p) => p.id !== producer.id
    );

    // roomState...mediaTag 에서 해당되는 track 정보를 제거한다.
    if (roomState.peers[producer.appData.peerId]) {
      delete roomState.peers[producer.appData.peerId].media[
        producer.appData.mediaTag
      ];
    }
  } catch (e) {
    err(e);
  }
}

async function closeConsumer(consumer) {
  log("closing consumer", consumer.id, consumer.appData);
  await consumer.close();

  // roomState.consumers 목록에서 전달받은 consumer를 제거한다.
  roomState.consumers = roomState.consumers.filter((c) => c.id !== consumer.id);

  // roomState...consumerLayers 에서 레이어 정보 제거
  if (roomState.peers[consumer.appData.peerId]) {
    delete roomState.peers[consumer.appData.peerId].consumerLayers[consumer.id];
  }
}

// mediasoup transport 객체를 만들고
// 클라이언트에서 transport 객체를 만드는 데 필요한 정보를 반환한다.
expressApp.post("/signaling/create-transport", async (req, res) => {
  try {
    let { peerId, direction } = req.body;
    log("create-transport", peerId, direction);

    let transport = await createWebRtcTransport({ peerId, direction });
    roomState.transports[transport.id] = transport;

    let { id, iceParameters, iceCandidates, dtlsParameters } = transport;
    res.send({
      transportOptions: { id, iceParameters, iceCandidates, dtlsParameters },
    });
  } catch (e) {
    console.error("error in /signaling/create-transport", e);
    res.send({ error: e });
  }
});

async function createWebRtcTransport({ peerId, direction }) {
  const { listenIps, initialAvailableOutgoingBitrate } =
    config.mediasoup.webRtcTransport;

  const transport = await router.createWebRtcTransport({
    listenIps: listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: initialAvailableOutgoingBitrate,
    appData: { peerId, clientDirection: direction },
  });

  return transport;
}

// 클라이언트의 `transport.on('connect')` 이벤트 핸들러 내부에서 호출된다.
expressApp.post("/signaling/connect-transport", async (req, res) => {
  try {
    let { peerId, transportId, dtlsParameters } = req.body,
      transport = roomState.transports[transportId];

    if (!transport) {
      err(`connect-transport: server-side transport ${transportId} not found`);
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
    let {
        peerId,
        transportId,
        kind,
        rtpParameters,
        paused = false,
        appData,
      } = req.body,
      transport = roomState.transports[transportId];

    if (!transport) {
      err(`send-track: server-side transport ${transportId} not found`);
      res.send({ error: `server-side transport ${transportId} not found` });
      return;
    }

    let producer = await transport.produce({
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

    roomState.producers.push(producer);
    roomState.peers[peerId].media[appData.mediaTag] = {
      paused,
      encodings: rtpParameters.encodings,
    };

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

    const producer = roomState.producers.find(
      (p) => p.appData.mediaTag === mediaTag && p.appData.peerId === mediaPeerId
    );

    if (!producer) {
      const msg =
        "server-side producer for " + `${mediaPeerId}:${mediaTag} not found`;
      err("recv-track: " + msg);
      res.send({ error: msg });
      return;
    }

    if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
      const msg = `client cannot consume ${mediaPeerId}:${mediaTag}`;
      err(`recv-track: ${peerId} ${msg}`);
      res.send({ error: msg });
      return;
    }

    const transport = Object.values(roomState.transports).find(
      (t) => t.appData.peerId === peerId && t.appData.clientDirection === "recv"
    );

    if (!transport) {
      const msg = `server-side recv transport for ${peerId} not found`;
      err("recv-track: " + msg);
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
      log(`consumer's transport closed`, consumer.id);
      closeConsumer(consumer);
    });
    consumer.on("producerclose", () => {
      console.log(">>>>>>>>> producerclose");
      log(`consumer's producer closed`, consumer.id);
      closeConsumer(consumer);
    });

    // consumer를 consumers에 추가하여 추적하고
    // 이 consumer의 클라이언트 관련 상태를 추적하는 데이터 구조를 만든다.
    roomState.consumers.push(consumer);
    roomState.peers[peerId].consumerLayers[consumer.id] = {
      currentLayer: null,
      clientSelectedLayer: null,
    };

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
    let { peerId, consumerId } = req.body,
      consumer = roomState.consumers.find((c) => c.id === consumerId);

    if (!consumer) {
      err(`pause-consumer: server-side consumer ${consumerId} not found`);
      res.send({ error: `server-side consumer ${consumerId} not found` });
      return;
    }

    log("resume-consumer", consumer.appData);

    await consumer.resume();

    res.send({ resumed: true });
  } catch (e) {
    console.error("error in /signaling/resume-consumer", e);
    res.send({ error: e });
  }
});

//
// stats
//

async function updatePeerStats() {
  for (let producer of roomState.producers) {
    if (producer.kind !== "video") {
      continue;
    }
    try {
      let stats = await producer.getStats(),
        peerId = producer.appData.peerId;
      roomState.peers[peerId].stats[producer.id] = stats.map((s) => ({
        bitrate: s.bitrate,
        fractionLost: s.fractionLost,
        jitter: s.jitter,
        score: s.score,
        rid: s.rid,
      }));
    } catch (e) {
      warn("error while updating producer stats", e);
    }
  }

  for (let consumer of roomState.consumers) {
    try {
      let stats = (await consumer.getStats()).find(
          (s) => s.type === "outbound-rtp"
        ),
        peerId = consumer.appData.peerId;
      if (!stats || !roomState.peers[peerId]) {
        continue;
      }
      roomState.peers[peerId].stats[consumer.id] = [
        {
          bitrate: stats.bitrate,
          fractionLost: stats.fractionLost,
          score: stats.score,
        },
      ];
    } catch (e) {
      warn("error while updating consumer stats", e);
    }
  }
}
