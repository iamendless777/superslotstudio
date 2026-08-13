export class SeededRNG {
  constructor(seed) {
    this.initialSeed = seed;
    this.state = seed;
  }

  random() {
    this.state |= 0;
    this.state = this.state + 0x6D2B79F5 | 0;
    let t = Math.imul(this.state ^ this.state >>> 15, 1 | this.state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  randInt(min, max) {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  pick(arr) {
    return arr[Math.floor(this.random() * arr.length)];
  }

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  reset() {
    this.state = this.initialSeed;
  }

  static generateSeed() {
    return (Math.random() * 0xFFFFFFFF) >>> 0;
  }
}
