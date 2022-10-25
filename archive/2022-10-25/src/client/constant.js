export const CAM_VIDEO_SIMULCAST_ENCODINGS = [
  { maxBitrate: 96000, scaleResolutionDownBy: 4 },
  { maxBitrate: 680000, scaleResolutionDownBy: 1 },
];

export const MEDIA_TYPE = {
  CAM_VIDEO: "cam-video",
  CAM_AUDIO: "cam-audio",
  SCREEN_VIDEO: "screen-video",
  SCREEN_AUDIO: "screen-audio",
};

export const TRANSPORT_DIRECTION = {
  SEND: "send",
  RECEIVE: "recv",
};
