import mediasoup from "mediasoup-client";
import { request, sleep, log, err } from "./utils";
import { CAM_VIDEO_SIMULCAST_ENCODINGS } from "./constant";
import httpClient from "./modules/httpClient";
import {
  getRouterRTPCapabilitiesAPI,
  createTransportAPI,
  connectTransportAPI,
  sendTrackAPI,
} from "./apis";

export default class InjeRTC {
  constructor(myPeerId) {
    this.state = {
      myPeerId: myPeerId,
      device: new mediasoup.Device(),
      localCam: null,
      joined: false,
      sendTransport: null,
      recvTransport: null,
      camVideoProducer: null,
      pollingInterval: null,
      peers: {},
      isReceiver: false,
      consumers: [],
    };
  }

  /**
   * @title 디바이스 정보 설정
   * @description 회의를 제어한다.
   * @returns
   */
  async loadDevice() {
    const { device } = this.state;

    try {
      // http 요청 - 새로운 피어임을 알린다.
      const { routerRtpCapabilities } = await getRouterRTPCapabilitiesAPI();
      // mediasoup-client device가 로드되지 않은 경우(처음 연결)
      if (!device.loaded) {
        // 디바이스를 초기화(로드) 한다.
        await device.load({ routerRtpCapabilities });
      }
    } catch (e) {
      console.error(e);
      return;
    }
  }

  /**
   * @title 카메라 스트림 전송
   */
  async sendCameraStreams() {
    await this.loadDevice();
    await this.startCamera();

    if (!this.state.sendTransport) {
      this.state.sendTransport = await this.createTransport("send");
    }

    // 비디오 전송을 시작
    this.state.camVideoProducer = await this.state.sendTransport.produce({
      track: this.state.localCam.getVideoTracks()[0],
      encodings: CAM_VIDEO_SIMULCAST_ENCODINGS,
      appData: { mediaTag: "cam-video" },
    });
  }

  /**
   * @title 카메라 시작
   * @returns
   */
  async startCamera() {
    if (this.state.localCam) {
      return;
    }
    try {
      this.state.localCam = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch (e) {
      console.error("start camera error", e);
    }
  }

  /**
   * @title transport 생성
   * @description transport를 생성하고, 전송 방향에 맞는 signal 로직을 연결한다.
   * @param {*} direction
   * @returns
   */
  async createTransport(direction) {
    const { myPeerId, device } = this.state;
    const roomId = myPeerId.split(".")[0];
    /**
     * 서버에 서버 측 transport 객체를 생성하도록 요청하고
     * 클라이언트 측 transport를 생성하는 데 필요한 정보를 다시 보내야한다.
     */
    let transport;
    // http 요청
    const { transportOptions } = await createTransportAPI({
      roomId,
      peerId: myPeerId,
      direction,
    });

    if (direction === "recv") {
      transport = await device.createRecvTransport(transportOptions);
    } else if (direction === "send") {
      transport = await device.createSendTransport(transportOptions);
    } else {
      throw new Error(`bad transport 'direction': ${direction}`);
    }

    /**
     * mediasoup-client는 미디어가 처음으로 흐르기 시작해야 연결 이벤트를 보낸다.
     * dtlsParameters를 서버로 보낸 다음 성공하면 resolve()을 호출하고 실패하면 reject()을 호출한다.
     * 여기에서 구독하는 이벤트 들은 transport.produce()가 호출되어야 구독된다
     */
    transport.on("connect", async ({ dtlsParameters }, resolve, reject) => {
      log("transport connect event", direction);
      // http 요청
      const { error } = await connectTransportAPI({
        roomId,
        peerId: myPeerId,
        transportId: transportOptions.id,
        dtlsParameters,
      });

      if (error) {
        err("error connecting transport", direction, error);
        reject();
        return;
      }
      resolve();
    });

    if (direction === "send") {
      /**
       * transport 전송은 전송을 시작하기 위해 새 track을 설정해야 할 때 생성 이벤트를 내보낸다.
       * producer의 appData는 매개변수로 전달
       */
      transport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, resolve, reject) => {
          log("transport produce event", appData.mediaTag);
          /**
           * 서버 측 producer 객체를 설정하기 위해 서버에게 우리의 정보를 전달하고 생산자 ID를 반환 받는다.
           * 성공 시 resolve() 또는 호출 실패 시 reject()  호출
           */
          // http 요청
          const { error, id } = await sendTrackAPI({
            roomId,
            peerId: myPeerId,
            transportId: transportOptions.id,
            kind,
            rtpParameters,
            paused: false,
            appData,
          });
          if (error) {
            err("error setting up server-side producer", error);
            reject();
            return;
          }
          resolve({ id });
        }
      );
    }

    return transport;
  }

  /**
   * @title receiver 페이지에서 트랙 노출
   */
  async showTracks() {
    // 틱 마다 서버에 저장된 peer 목록으로 로컬 데이터를 동기화 하고
    // receiver 페이지는 동기화된 peer 목록을 기반으로 UI를 갱신한다.
    // sender 페이지는 peer 목록을 노출하지 않기 때문에 flag 값으로 제어한다.
    this.state.isReceiver = true;
    await this.joinRoom();
  }

  /**
   * @title track 구독
   * @param {string} peerId
   * @param {*} mediaTag
   * @returns
   */
  async subscribeToTrack(peerId, mediaTag) {
    log("subscribe to track", peerId, mediaTag);

    // receive transport 를 갖고 있지 않다면 receive transport를 생성한다.
    if (!this.state.recvTransport) {
      this.state.recvTransport = await this.createTransport("recv");
    }
    const { myPeerId, consumers, recvTransport, device } = this.state;

    // track을 위한 컨슈머 검색
    const hasConsumer = !!consumers.find((c) => {
      return c.appData.peerId === peerId && c.appData.mediaTag === mediaTag;
    });

    if (hasConsumer) {
      // consumer 존재한다면, 호출되지 않아야 하므로 리턴처리
      err("already have consumer for track", peerId, mediaTag);
      return;
    }

    /**
     * http 요청 - 서버에 서버 측 consumer 객체를 만들고 전송하도록 요청하고
     * 클라이언트 측 consumer를 만드는 데 필요한 정보를 백업한다.
     */
    const consumerParameters = await request({
      endpoint: "recv-track",
      payload: {
        peerId: myPeerId,
        mediaTag,
        mediaPeerId: peerId,
        rtpCapabilities: device.rtpCapabilities,
      },
    });
    log("consumer parameters", consumerParameters);
    const consumer = await recvTransport.consume({
      ...consumerParameters,
      appData: { peerId, mediaTag },
    });

    log("created new consumer", consumer.id);

    /**
     * 서버 측 consumer는 일시 중지된 상태에서 시작된다.
     * 연결될 때까지 기다린 다음 첫 번째 키프레임을 가져오고 비디오 표시를 시작하기 위해 서버 resume 요청을 보낸다.
     */
    while (recvTransport.connectionState !== "connected") {
      log("  transport connstate", recvTransport.connectionState);
      await sleep(100);
    }
    // 클라이언트 준비 완료, peer에 미디어를 보내달라고 요청한다.
    await request({
      endpoint: "resume-consumer",
      method: "post",
      payload: { peerId: myPeerId, consumerId: consumer.id },
    });
    await consumer.resume();

    // consumer 목록 추가
    consumers.push(consumer);

    await this.addVideoAudio(consumer);
  }

  /**
   * @title 비디오 또는 오디오 추가
   * @param {*} consumer
   * @returns
   */
  addVideoAudio(consumer) {
    if (!(consumer && consumer.track)) {
      return;
    }
    const el = document.createElement(consumer.kind);
    /**
     * 오디오와 비디오 엘리먼트를 만들기 위해서 일부 어트리뷰트를 설정한다.
     * 오디오를 재생하려면 mic/camera에서 캡처해야 한다.
     */
    if (consumer.kind === "video") {
      el.setAttribute("playsinline", true);
    } else {
      el.setAttribute("playsinline", true);
      el.setAttribute("autoplay", true);
    }
    document.querySelector("#video").appendChild(el);
    el.srcObject = new MediaStream([consumer.track.clone()]);
    el.consumer = consumer;
    /**
     * play의 성공을 기다리기보다 play 하기 전에 yield 하고 리턴한다.
     * play()는 producer 일시 중지를 해제할 때까지
     * producer 일시 중지 트랙에서 성공하지 못한다.
     */
    el.play()
      .then(() => {})
      .catch((e) => {
        err(e);
      });
  }
}
