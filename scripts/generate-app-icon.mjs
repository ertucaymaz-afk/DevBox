import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SUPERSAMPLE = 4;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(width, height, rgba) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1); scanlines[target] = 0;
    rgba.copy(scanlines, target + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(scanlines, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function clamp(value, min = 0, max = 255) { return Math.max(min, Math.min(max, value)); }
function mix(a, b, t) { return a + (b - a) * t; }
function rgbaSet(buffer, width, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= width || y >= width) return;
  const offset = (y * width + x) * 4;
  const srcA = clamp(color[3] * alpha) / 255;
  const dstA = buffer[offset + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) buffer[offset + channel] = Math.round((color[channel] * srcA + buffer[offset + channel] * dstA * (1 - srcA)) / outA);
  buffer[offset + 3] = Math.round(outA * 255);
}
function roundedBox(buffer, width, left, top, right, bottom, radius, colorAt) {
  for (let y = Math.floor(top); y < Math.ceil(bottom); y += 1) for (let x = Math.floor(left); x < Math.ceil(right); x += 1) {
    const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
    const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
    const dx = x + .5 - cx; const dy = y + .5 - cy;
    if (dx * dx + dy * dy <= radius * radius) rgbaSet(buffer, width, x, y, colorAt(x, y));
  }
}
function line(buffer, width, ax, ay, bx, by, thickness, color) {
  const minX = Math.floor(Math.min(ax, bx) - thickness); const maxX = Math.ceil(Math.max(ax, bx) + thickness);
  const minY = Math.floor(Math.min(ay, by) - thickness); const maxY = Math.ceil(Math.max(ay, by) + thickness);
  const vx = bx - ax; const vy = by - ay; const len2 = vx * vx + vy * vy || 1;
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const t = Math.max(0, Math.min(1, ((x + .5 - ax) * vx + (y + .5 - ay) * vy) / len2));
    const px = ax + t * vx; const py = ay + t * vy; const dx = x + .5 - px; const dy = y + .5 - py;
    if (dx * dx + dy * dy <= (thickness * .5) ** 2) rgbaSet(buffer, width, x, y, color);
  }
}
function polygon(buffer, width, points, color) {
  const minY = Math.floor(Math.min(...points.map((p) => p[1]))); const maxY = Math.ceil(Math.max(...points.map((p) => p[1])));
  for (let y = minY; y <= maxY; y += 1) {
    const intersections = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i]; const b = points[(i + 1) % points.length];
      if ((a[1] > y + .5) !== (b[1] > y + .5)) intersections.push(a[0] + ((y + .5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    intersections.sort((a,b) => a-b);
    for (let i = 0; i + 1 < intersections.length; i += 2) for (let x = Math.ceil(intersections[i] - .5); x < intersections[i + 1] - .5; x += 1) rgbaSet(buffer, width, x, y, color);
  }
}
function renderHigh(size) {
  const width = size * SUPERSAMPLE; const b = Buffer.alloc(width * width * 4); const u = width / 256;
  const L = 17*u, T = 17*u, R = 239*u, B = 239*u, r = 51*u;
  roundedBox(b, width, L, T, R, B, r, (x,y) => {
    const t = (x + y) / (2 * width);
    const base = [mix(26,10,t), mix(29,13,t), mix(33,16,t), 250];
    return base;
  });
  roundedBox(b, width, 22*u, 22*u, 234*u, 234*u, 46*u, (x,y) => {
    const fx = (x - 22*u)/(212*u), fy=(y-22*u)/(212*u); const flame=Math.max(0,1-Math.hypot(fx-.79,fy-.2)*1.18);
    return [Math.round(23+40*flame),Math.round(25+9*flame),Math.round(28+2*flame),Math.round(245*clamp(1,0,1))];
  });
  // Flame ribbon, deliberately abstract rather than a literal fire emoji.
  polygon(b,width,[[177*u,34*u],[213*u,83*u],[185*u,78*u],[208*u,126*u],[165*u,100*u],[181*u,155*u],[139*u,118*u],[145*u,61*u]],[230,55,34,235]);
  polygon(b,width,[[181*u,44*u],[201*u,78*u],[180*u,75*u],[197*u,107*u],[166*u,90*u],[174*u,129*u],[151*u,102*u],[156*u,68*u]],[255,103,40,225]);
  // DevBox cube / code glyph.
  const white=[245,248,250,245], red=[255,89,58,255], dim=[186,195,202,180];
  const pTop=[105*u,72*u], pRight=[161*u,104*u], pBottom=[105*u,137*u], pLeft=[49*u,104*u];
  line(b,width,pTop[0],pTop[1],pRight[0],pRight[1],7*u,white); line(b,width,pRight[0],pRight[1],pBottom[0],pBottom[1],7*u,white);
  line(b,width,pBottom[0],pBottom[1],pLeft[0],pLeft[1],7*u,dim); line(b,width,pLeft[0],pLeft[1],pTop[0],pTop[1],7*u,dim);
  line(b,width,pLeft[0],pLeft[1],pLeft[0],160*u,7*u,dim); line(b,width,pRight[0],pRight[1],pRight[0],160*u,7*u,white);
  line(b,width,pLeft[0],160*u,pBottom[0],192*u,7*u,dim); line(b,width,pBottom[0],192*u,pRight[0],160*u,7*u,white);
  line(b,width,pBottom[0],pBottom[1],pBottom[0],192*u,7*u,white);
  // terminal chevron and cursor
  line(b,width,73*u,122*u,91*u,134*u,7*u,red); line(b,width,91*u,134*u,73*u,146*u,7*u,red); line(b,width,104*u,148*u,132*u,148*u,6*u,white);
  // subtle corner highlight
  line(b,width,57*u,45*u,109*u,31*u,3*u,[255,255,255,35]);
  return b;
}
function downsample(high, target) {
  const source = target * SUPERSAMPLE; const out = Buffer.alloc(target * target * 4);
  for (let y=0;y<target;y+=1) for(let x=0;x<target;x+=1) {
    const sum=[0,0,0,0];
    for(let sy=0;sy<SUPERSAMPLE;sy+=1) for(let sx=0;sx<SUPERSAMPLE;sx+=1){ const offset=(((y*SUPERSAMPLE+sy)*source)+(x*SUPERSAMPLE+sx))*4; for(let c=0;c<4;c+=1) sum[c]+=high[offset+c]; }
    const targetOffset=(y*target+x)*4; for(let c=0;c<4;c+=1) out[targetOffset+c]=Math.round(sum[c]/(SUPERSAMPLE*SUPERSAMPLE));
  }
  return out;
}
function frame(size) { return png(size,size,downsample(renderHigh(size),size)); }
function ico(frames) {
  const header=Buffer.alloc(6); header.writeUInt16LE(0,0); header.writeUInt16LE(1,2); header.writeUInt16LE(frames.length,4);
  const entries=[]; let offset=6+frames.length*16;
  for(const {size,data} of frames){ const entry=Buffer.alloc(16); entry[0]=size===256?0:size; entry[1]=size===256?0:size; entry[2]=0; entry[3]=0; entry.writeUInt16LE(1,4); entry.writeUInt16LE(32,6); entry.writeUInt32LE(data.length,8); entry.writeUInt32LE(offset,12); entries.push(entry); offset+=data.length; }
  return Buffer.concat([header,...entries,...frames.map((item)=>item.data)]);
}

const output = path.resolve("build"); await mkdir(output,{recursive:true});
const frames=SIZES.map((size)=>({size,data:frame(size)}));
await writeFile(path.join(output,"icon.ico"),ico(frames));
await writeFile(path.join(output,"icon-master.png"),frames.at(-1).data);
console.log(`DEVBOX_ICON_GENERATED sizes=${SIZES.join(",")} ico=${path.join(output,"icon.ico")} png=${path.join(output,"icon-master.png")}`);
