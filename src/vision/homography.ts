/**
 * Perspective (homography) maths for 4-corner "Quad" vision zones.
 *
 * A Quad zone is the image of the unit square under the homography that sends
 * (0,0)→TL, (1,0)→TR, (1,1)→BR, (0,1)→BL (Heckbert's square-to-quad). A grid on it is the
 * unit-square lattice pushed through the same map, so cells shrink with distance exactly as
 * the squares of a board seen at an angle do. Works the same in normalized or pixel space —
 * scaling the corners scales the result.
 *
 * The canvas inside the zone WebView can't import modules, so the same functions are also
 * shipped as source in HOMOGRAPHY_JS; scripts/homography-check.mts checks the two agree.
 */

export type Pt = [number, number];

/** 3×3 homography as [a, b, c, d, e, f, g, h] with i = 1: x' = (a u + b v + c)/(g u + h v + 1). */
export type Homography = [number, number, number, number, number, number, number, number];

/** The homography mapping the unit square onto the quad TL, TR, BR, BL. */
export function squareToQuad(q: Pt[]): Homography {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-12 || Math.abs(dy3) > 1e-12) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) > 1e-18) {
      g = (dx3 * dy2 - dx2 * dy3) / den;
      h = (dx1 * dy3 - dx3 * dy1) / den;
    }
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

/** Applies a homography to (u, v). */
export function applyH(H: Homography, u: number, v: number): Pt {
  const w = H[6] * u + H[7] * v + 1;
  return [(H[0] * u + H[1] * v + H[2]) / w, (H[3] * u + H[4] * v + H[5]) / w];
}

/** Corners TL, TR, BR, BL of grid cell (r, c) on a rows×cols perspective grid over quad q. */
export function quadCellQuad(q: Pt[], rows: number, cols: number, r: number, c: number): Pt[] {
  const H = squareToQuad(q);
  const u0 = c / cols, u1 = (c + 1) / cols, v0 = r / rows, v1 = (r + 1) / rows;
  return [applyH(H, u0, v0), applyH(H, u1, v0), applyH(H, u1, v1), applyH(H, u0, v1)];
}

/** True for 4 corners forming a convex quad that winds one way (a usable perspective zone). */
export function isConvexQuad(q: Pt[]): boolean {
  if (q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4], [cx, cy] = q[(i + 2) % 4];
    const z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(z) < 1e-12) return false;
    const s = Math.sign(z);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** The same functions, as plain browser JS for the zone canvas (keep in step with the above). */
export const HOMOGRAPHY_JS = `
function squareToQuad(q){
  var x0=q[0][0],y0=q[0][1],x1=q[1][0],y1=q[1][1],x2=q[2][0],y2=q[2][1],x3=q[3][0],y3=q[3][1];
  var dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3,g=0,h=0;
  if(Math.abs(dx3)>1e-12||Math.abs(dy3)>1e-12){var den=dx1*dy2-dx2*dy1;
    if(Math.abs(den)>1e-18){g=(dx3*dy2-dx2*dy3)/den;h=(dx1*dy3-dx3*dy1)/den;}}
  return [x1-x0+g*x1,x3-x0+h*x3,x0,y1-y0+g*y1,y3-y0+h*y3,y0,g,h];
}
function applyH(H,u,v){var w=H[6]*u+H[7]*v+1;return [(H[0]*u+H[1]*v+H[2])/w,(H[3]*u+H[4]*v+H[5])/w];}
function quadCellQuad(q,rows,cols,r,c){var H=squareToQuad(q),u0=c/cols,u1=(c+1)/cols,v0=r/rows,v1=(r+1)/rows;
  return [applyH(H,u0,v0),applyH(H,u1,v0),applyH(H,u1,v1),applyH(H,u0,v1)];}
function isConvexQuad(q){if(!q||q.length!==4)return false;var sign=0;
  for(var i=0;i<4;i++){var a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];var z=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    if(Math.abs(z)<1e-12)return false;var s=z>0?1:-1;if(sign===0)sign=s;else if(s!==sign)return false;}
  return true;}
`;
