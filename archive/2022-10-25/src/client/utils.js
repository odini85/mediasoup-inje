export async function sleep(delay) {
  return new Promise((resolve) => setTimeout(() => resolve(), delay));
}

export function log(...args) {
  console.log(">>>>>", ...args);
}

export function err(...args) {
  console.error(">>>>>", ...args);
}

export async function request({ endpoint, method = "POST", payload = {} }) {
  const response = await fetch(`/signaling/${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await response.json();
}

export function encodePeerId({ roomId, userId }) {
  return `${roomId}.${userId}`;
}

export function decodePeerId(peerId) {
  const [roomId, userId] = peerId.split(".");
  return {
    roomId,
    userId,
  };
}
