export class ProducerVo {
  constructor(peer) {
    const producer = peer.getProducer();

    this.peerId = peer.getId();
    this.id = producer.id;
    this.paused = producer.paused;
    this.closed = producer.closed;
  }
}
