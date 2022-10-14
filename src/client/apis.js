import httpClient from "./modules/httpClient";

export function loginAPI(payload) {
  return httpClient.get("/login", payload);
}

export function roomCreateAPI() {
  return httpClient.get("/room/create");
}

export function roomListAPI() {
  return httpClient.get("/room/list");
}

// signaling
export function getRouterRTPCapabilitiesAPI(payload) {
  return httpClient.get("/signaling/router-rtp-capabilities", payload);
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
