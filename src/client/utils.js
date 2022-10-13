export async function sleep(delay) {
  return new Promise((resolve) => setTimeout(() => resolve(), delay));
}

export function log(...args) {
  console.log(">>>>>", ...args);
}

export function err(...args) {
  console.error(">>>>>", ...args);
}
