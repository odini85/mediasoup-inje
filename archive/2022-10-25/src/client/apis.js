import httpClient from "./modules/httpClient";

// 로그인
export function loginAPI(payload) {
  return httpClient.get("/login", payload);
}

// room 생성
export function roomCreateAPI() {
  return httpClient.get("/room/create");
}

// room 목록 반환
export function roomListAPI() {
  return httpClient.get("/room/list");
}

// room 참여자 목록 반환
export function getPeersByRoomId(roomId) {
  return httpClient.get(`/room/${roomId}/peers`);
}

/**
 * signaling
 */
export function getRouterRTPCapabilitiesAPI() {
  return httpClient.get("/signaling/router-rtp-capabilities");
}

export function syncAPI(data) {
  return httpClient.post("/signaling/sync", { data });
}

export function connectTransportAPI(data) {
  return httpClient.post("/signaling/connect-transport", { data });
}

export function recvTrackAPI(data) {
  return httpClient.post("/signaling/recv-track", { data });
}

export function resumeConsumerAPI(data) {
  return httpClient.post("/signaling/resume-consumer", { data });
}

export function createTransportAPI(data) {
  return httpClient.post("/signaling/create-transport", { data });
}

export function sendTrackAPI(data) {
  return httpClient.post("/signaling/send-track", { data });
}
