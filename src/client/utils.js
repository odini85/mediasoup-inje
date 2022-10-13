export function uuidv4() {
  return "111-111-1111".replace(/[018]/g, () =>
    (crypto.getRandomValues(new Uint8Array(1))[0] & 15).toString(16)
  );
}

export async function request({ endpoint, method = "POST", payload = {} }) {
  const response = await fetch(`/signaling/${endpoint}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return await response.json();
}

export async function sleep(delay) {
  return new Promise((resolve) => setTimeout(() => resolve(), delay));
}

export function log(...args) {
  console.log(">>>>>", ...args);
}

export function err(...args) {
  console.error(">>>>>", ...args);
}
