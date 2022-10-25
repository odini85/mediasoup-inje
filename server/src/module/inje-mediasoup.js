import * as mediasoup from "mediasoup";
import debugModule from "debug";

import config from "../config";

const log = debugModule("demo-app");
const warn = debugModule("demo-app:WARN");
const err = debugModule("demo-app:ERROR");

class InjeMediasoup {
  constructor() {
    this._worker = null;
    this._router = null;
    this._startMediasoup();
  }

  getMediasoupWorker() {
    return this._worker;
  }
  getMediasoupRouter() {
    return this._router;
  }
  //
  // 단일 worker, router로 mediasoup 시작
  //
  async _startMediasoup() {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on("died", () => {
      console.error("mediasoup worker died (this should never happen)");
      process.exit(1);
    });

    const router = await worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs,
    });

    this._worker = worker;
    this._router = router;
  }
}

export default new InjeMediasoup();
