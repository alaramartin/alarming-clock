export function buildNoise(seed = 42): (x: number, y: number) => number {
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 4294967296; };
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  const g2: [number, number][] = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  return (xin, yin) => {
    const s_ = (xin + yin) * F2;
    const i = Math.floor(xin + s_), j = Math.floor(yin + s_);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const ii = i & 255, jj = j & 255;
    const c = (px: number, py: number, gi: number) => {
      let t = 0.5 - px*px - py*py; if (t < 0) return 0; t *= t;
      const [gx, gz] = g2[perm[gi] % 8]; return t * t * (gx*px + gz*py);
    };
    return 70 * (c(x0,y0,ii+perm[jj]) + c(x0-i1+G2,y0-j1+G2,ii+i1+perm[jj+j1]) + c(x0-1+2*G2,y0-1+2*G2,ii+1+perm[jj+1]));
  };
}
