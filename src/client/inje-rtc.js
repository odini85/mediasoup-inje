import mediasoup from "mediasoup-client";
import { request, sleep, log, err } from "./utils";
import {
  CAM_VIDEO_SIMULCAST_ENCODINGS,
  MEDIA_TYPE,
  TRANSPORT_DIRECTION,
} from "./constant";
import httpClient from "./modules/httpClient";
import {
  getRouterRTPCapabilitiesAPI,
  createTransportAPI,
  connectTransportAPI,
  sendTrackAPI,
  recvTrackAPI,
  resumeConsumerAPI,
} from "./apis";

export default class InjeRTC {
  constructor(myPeerId) {
    this.state = {
      myPeerId,
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
  async _loadDevice() {
    const { device } = this.state;
    // mediasoup-client device가 로드되지 않은 경우(처음 연결)
    if (device.loaded) {
      return;
    }

    try {
      // http 요청 - 새로운 피어임을 알린다.
      const { routerRtpCapabilities } = await getRouterRTPCapabilitiesAPI();
      // 디바이스를 초기화(로드) 한다.
      await device.load({ routerRtpCapabilities });
    } catch (e) {
      console.error(e);
      return;
    }
  }

  /**
   * @title 카메라 시작
   * @returns
   */
  async _startCam() {
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
   * @title 화면 공유 시작
   * @returns
   */
  async _startScreen() {}

  _getProduceParam(mediaType) {
    switch (mediaType) {
      case MEDIA_TYPE.CAM_VIDEO: {
        return {
          track: this.state.localCam.getVideoTracks()[0],
          encodings: CAM_VIDEO_SIMULCAST_ENCODINGS,
          appData: { mediaType },
        };
      }
      case MEDIA_TYPE.CAM_AUDIO: {
        return {
          track: this.state.localCam.getAudioTracks()[0],
          encodings: CAM_VIDEO_SIMULCAST_ENCODINGS,
          appData: { mediaType },
        };
      }
      case MEDIA_TYPE.SCREEN_VIDEO: {
        return {
          track: this.state.localCam.getVideoTracks()[0],
          encodings: CAM_VIDEO_SIMULCAST_ENCODINGS,
          appData: { mediaType },
        };
      }
      case MEDIA_TYPE.SCREEN_AUDIO: {
        return {
          track: this.state.localCam.getVideoTracks()[0],
          encodings: CAM_VIDEO_SIMULCAST_ENCODINGS,
          appData: { mediaType },
        };
      }
    }
  }

  /**
   * @title 카메라 스트림 전송
   */
  async produce(mediaType) {
    await this._loadDevice();

    switch (mediaType) {
      case MEDIA_TYPE.CAM_VIDEO:
      case MEDIA_TYPE.CAM_AUDIO: {
        await this._startCam();
        break;
      }
      case MEDIA_TYPE.SCREEN_VIDEO:
      case MEDIA_TYPE.SCREEN_AUDIO: {
        await this._startScreen();
        break;
      }
    }

    if (!this.state.sendTransport) {
      this.state.sendTransport = await this._createTransport(
        TRANSPORT_DIRECTION.SEND
      );
    }

    const produceParam = this._getProduceParam(mediaType);

    this.state.camVideoProducer = await this.state.sendTransport.produce(
      produceParam
    );
  }

  /**
   * @title transport 생성
   * @description transport를 생성하고, 전송 방향에 맞는 signal 로직을 연결한다.
   * @param {*} direction
   * @returns
   */
  async _createTransport(direction) {
    const { myPeerId, device } = this.state;
    /**
     * 서버에 서버 측 transport 객체를 생성하도록 요청하고
     * 클라이언트 측 transport를 생성하는 데 필요한 정보를 다시 보내야한다.
     */
    let transport;
    // http 요청
    const { transportOptions } = await createTransportAPI({
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
        peerId: myPeerId,
        transportId: transportOptions.id,
        dtlsParameters,
        direction,
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
          log("transport produce event", appData.mediaType);
          /**
           * 서버 측 producer 객체를 설정하기 위해 서버에게 우리의 정보를 전달하고 생산자 ID를 반환 받는다.
           * 성공 시 resolve() 또는 호출 실패 시 reject()  호출
           */
          // http 요청
          const { error, id } = await sendTrackAPI({
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
   * @title 스트림 소비
   */
  async consume(mediaType, consumePeerId) {
    await this._loadDevice();

    // receive transport 를 갖고 있지 않다면 receive transport를 생성한다.
    if (!this.state.recvTransport) {
      this.state.recvTransport = await this._createTransport(
        TRANSPORT_DIRECTION.RECEIVE
      );
    }
    const { myPeerId, consumers, recvTransport, device } = this.state;

    // track을 위한 컨슈머 검색
    const hasConsumer = !!consumers.find((consumer) => {
      return (
        consumer.appData.peerId === consumePeerId &&
        consumer.appData.mediaType === mediaType
      );
    });

    if (hasConsumer) {
      // consumer 존재한다면, 호출되지 않아야 하므로 리턴처리
      err("already have consumer for track", peerId, mediaType);
      return;
    }

    /**
     * http 요청 - 서버에 서버 측 consumer 객체를 만들고 전송하도록 요청하고
     * 클라이언트 측 consumer를 만드는 데 필요한 정보를 백업한다.
     */
    const consumerParameters = await recvTrackAPI({
      peerId: myPeerId,
      mediaType,
      mediaPeerId: consumePeerId,
      rtpCapabilities: device.rtpCapabilities,
    });
    log("consumer parameters", consumerParameters);
    const consumer = await recvTransport.consume({
      ...consumerParameters,
      appData: { peerId: consumePeerId, mediaType },
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
    await resumeConsumerAPI({ peerId: myPeerId, consumerId: consumer.id });

    await consumer.resume();

    // consumer 목록 추가
    consumers.push(consumer);

    // 비디오 추가
    await this._addVideo(consumer, consumePeerId);

    return consumer;
  }

  /**
   * @title 비디오 추가
   * @param {*} consumer
   * @returns
   */
  _addVideo(consumer, peerId) {
    if (!(consumer && consumer.track)) {
      return;
    }

    const videoEl = document.createElement(consumer.kind);
    const wrapperEl = document.querySelector("#uid_room_peers_list");
    wrapperEl.appendChild(videoEl);
    console.log({ wrapperEl, peerId });
    // const videoEl = wrapperEl.querySelector("video");

    videoEl.setAttribute("playsinline", true);
    videoEl.srcObject = new MediaStream([consumer.track.clone()]);

    /**
     * play의 성공을 기다리기보다 play 하기 전에 yield 하고 리턴한다.
     * play()는 producer 일시 중지를 해제할 때까지
     * producer 일시 중지 트랙에서 성공하지 못한다.
     */
    videoEl
      .play()
      .then(() => {})
      .catch((e) => {
        err(e);
      });
  }
}
