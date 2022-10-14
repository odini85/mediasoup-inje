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
export function joinAsNewPeerAPI(payload) {
  return httpClient.post("/signaling/join-as-new-peer", payload);
}

export function syncAPI(payload) {
  return httpClient.post("/signaling/sync", payload);
}

export function connectTransportAPI(payload) {
  return httpClient.post("/signaling/connect-transport", payload);
}

export function recvTrackAPI(payload) {
  return httpClient.post("/signaling/recv-track", payload);
}

export function resumeConsumerAPI(payload) {
  return httpClient.post("/signaling/resume-consumer", payload);
}

export function createTransportAPI(payload) {
  return httpClient.post("/signaling/create-transport", payload);
}

export function sendTrackAPI(payload) {
  return httpClient.post("/signaling/send-track", payload);
}
