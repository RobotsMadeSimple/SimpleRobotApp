import { VisionZone, VisionZoneGeometry, VisionZoneGrid, VisionZoneShape } from "@/src/models/robotModels";

/**
 * Zone draw/edit canvas.
 *
 * There is always at most one *working geometry*. Until it exists you are drawing:
 * drag out a rectangle or circle, or tap out polygon points. Once it exists you are
 * editing: drag a handle to reshape, drag the interior to move. Nothing is committed
 * back to the program until the host taps Save, so Cancel is always a clean exit.
 *
 * `initialGeometry` seeds the working geometry, which is what makes "edit the zone I
 * already have" work rather than forcing a redraw from scratch. `initialGrid` is drawn
 * over it but not owned here — the host keeps that and pushes updates in via setGrid.
 *
 * Pointer events rather than touch events: the app also runs on web and Electron,
 * where touch events never fire and the editor would otherwise be dead to a mouse.
 */
export function makeZoneDrawHtml(
  imageUri: string,
  zones: VisionZone[],
  editingZoneId: string | null,
  activeShape: VisionZoneShape,
  initialGeometry?: VisionZoneGeometry | null,
  initialGrid?: VisionZoneGrid | null
): string {
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden;touch-action:none}
canvas{display:block;position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
var c=document.getElementById('c'),ctx=c.getContext('2d');
var zones=${JSON.stringify(zones)};
var editingId=${JSON.stringify(editingZoneId)};
var drawShape=${JSON.stringify(activeShape)};
var grid=${JSON.stringify(initialGrid ?? null)};
var geom=${JSON.stringify(initialGeometry ?? null)};
var editing=!!geom;
var polyPts=[];   // screen-space points, polygon draw phase only
var drag=null;
var HIT=26;       // finger-sized handle hit radius
var ROT_ARM=34;   // how far the rotation grip stands off the top edge
var ORANGE='#f97316';

var img=new Image();
img.onload=function(){resize();render();};
img.onerror=function(){resize();render();};
img.src=${JSON.stringify(imageUri)};

function resize(){
  c.width=window.innerWidth;
  c.height=window.innerHeight;
}
window.addEventListener('resize',function(){resize();render();});

function post(){
  try{window.ReactNativeWebView.postMessage(JSON.stringify({
    type:'state',geometry:geom,editing:editing,pts:polyPts.length
  }));}catch(e){}
}

function reset(){polyPts=[];drag=null;geom=null;editing=false;}

window.setShape=function(s){drawShape=s;reset();render();post();};
window.clearShape=function(){reset();render();post();};
window.undoPoint=function(){if(polyPts.length){polyPts.pop();render();post();}};

// The grid is owned by the host — the canvas only draws it, so the steppers in the
// toolbar stay the single source of truth and there is nothing here to merge back.
window.setGrid=function(g){grid=g;render();};

// Lets the host put a rectangle back to square without hunting for 0 with the grip.
window.setRotation=function(d){
  if(geom&&geom.shape==='Rectangle'){geom.rotation=d;render();post();}
};

window.closePolygon=function(){
  if(polyPts.length<3) return;
  var r=imgRect();
  geom={shape:'Polygon',x:0,y:0,width:1,height:1,rotation:0,cx:0.5,cy:0.5,radius:0.25,
        points:polyPts.map(function(p){return[clamp01((p[0]-r.x)/r.w),clamp01((p[1]-r.y)/r.h)];})};
  polyPts=[];editing=true;drag=null;render();post();
};

function imgRect(){
  var iw=img.naturalWidth||1,ih=img.naturalHeight||1;
  var cw=c.width,ch=c.height;
  var scale=Math.min(cw/iw,ch/ih);
  var w=iw*scale,h=ih*scale;
  return{x:(cw-w)/2,y:(ch-h)/2,w:w,h:h};
}
function toNorm(px,py){var r=imgRect();return{x:(px-r.x)/r.w,y:(py-r.y)/r.h};}
function toScr(nx,ny){var r=imgRect();return{x:r.x+nx*r.w,y:r.y+ny*r.h};}
function clamp01(v){return Math.max(0,Math.min(1,v));}

// ── Rotated rectangles ───────────────────────────────────────────────────────
//
// Rotation is degrees clockwise about the rectangle's own centre, and is applied in
// screen space rather than the 0-1 space the geometry is stored in: there x and y are
// scaled by different factors, and rotating inside a non-uniform scale shears the
// rectangle instead of turning it. Screen space is a uniform scale of the image, so an
// angle means the same thing here as it does on the controller.

function rot(g){return (g&&g.shape==='Rectangle'&&g.rotation)?g.rotation:0;}

// The rectangle's local axes: u runs along its width, v along its height.
function axes(g){
  var a=rot(g)*Math.PI/180;
  return{ux:Math.cos(a),uy:Math.sin(a),vx:-Math.sin(a),vy:Math.cos(a)};
}

// Corners of a box stated in the rectangle's own frame (offsets from its centre),
// rotated and placed back on that centre. The rectangle and each of its grid cells are
// both boxes in that frame, so they turn through one function and cannot drift apart.
function localQuad(cx,cy,x0,y0,x1,y1,deg){
  var a=deg*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a);
  function P(lx,ly){return{x:cx+lx*cs-ly*sn,y:cy+lx*sn+ly*cs};}
  return[P(x0,y0),P(x1,y0),P(x1,y1),P(x0,y1)];
}

// Screen-space centre and half-extents of a rectangle geometry.
function rectFrame(g){
  var r=imgRect(),hw=g.width*r.w/2,hh=g.height*r.h/2;
  return{cx:r.x+g.x*r.w+hw,cy:r.y+g.y*r.h+hh,hw:hw,hh:hh};
}

// Corners in screen pixels, clockwise from top-left.
function rectCorners(g){
  var f=rectFrame(g);
  return localQuad(f.cx,f.cy,-f.hw,-f.hh,f.hw,f.hh,rot(g));
}

function cellQuad(g,rows,cols,row,col){
  var f=rectFrame(g);
  return localQuad(f.cx,f.cy,
    -f.hw+2*f.hw*col/cols,     -f.hh+2*f.hh*row/rows,
    -f.hw+2*f.hw*(col+1)/cols, -f.hh+2*f.hh*(row+1)/rows, rot(g));
}

function quadBounds(q){
  var xs=q.map(function(p){return p.x;}),ys=q.map(function(p){return p.y;});
  var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
  var y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
  return{x:x0,y:y0,w:x1-x0,h:y1-y0};
}

function traceQuad(q){
  ctx.beginPath();ctx.moveTo(q[0].x,q[0].y);
  for(var i=1;i<q.length;i++) ctx.lineTo(q[i].x,q[i].y);
  ctx.closePath();
}

// Wrapped to (-180,180] and nudged onto 15-degree marks when already within 3 degrees,
// so square and diagonal placements are easy to land and 0 is easy to get back to.
function snapAngle(deg){
  deg=((deg+180)%360+360)%360-180;
  var near=Math.round(deg/15)*15;
  return Math.abs(deg-near)<=3?near:Math.round(deg*10)/10;
}

// ── Handles ──────────────────────────────────────────────────────────────────

function handles(){
  if(!geom) return [];
  var r=imgRect();
  if(geom.shape==='Rectangle'){
    var q=rectCorners(geom);
    var ax=axes(geom);
    // The rotation grip is held off the top edge along the rectangle's own "up", so it
    // keeps the same place relative to the shape as the shape turns.
    var mid={x:(q[0].x+q[1].x)/2,y:(q[0].y+q[1].y)/2};
    return[{id:'nw',x:q[0].x,y:q[0].y},{id:'ne',x:q[1].x,y:q[1].y},
           {id:'se',x:q[2].x,y:q[2].y},{id:'sw',x:q[3].x,y:q[3].y},
           {id:'rotate',x:mid.x-ax.vx*ROT_ARM,y:mid.y-ax.vy*ROT_ARM}];
  }
  if(geom.shape==='Circle'){
    var p=toScr(geom.cx,geom.cy),rad=geom.radius*Math.min(r.w,r.h);
    return[{id:'center',x:p.x,y:p.y},{id:'radius',x:p.x+rad,y:p.y}];
  }
  if(geom.shape==='Polygon'){
    return geom.points.map(function(p,i){return{id:i,x:r.x+p[0]*r.w,y:r.y+p[1]*r.h};});
  }
  return[];
}

// A fixed finger-sized grab radius swallows a small zone whole - every interior
// point lands within reach of some corner, and the shape can never be picked up and
// moved. Shrinking it for small shapes keeps a central region that falls through to
// a body drag, at the cost of a fiddlier grab on a zone that is tiny anyway.
function hitRadius(){
  var b=zoneBounds(geom);
  return Math.max(6,Math.min(HIT,Math.min(b.w,b.h)/3));
}

// Nearest handle within the grab radius, so overlapping handles (a small circle's
// centre and radius grip) resolve to whichever the finger is actually closer to.
function hitHandle(x,y){
  var hs=handles(),best=null,bd=Infinity,hr=hitRadius();
  for(var i=0;i<hs.length;i++){
    // The rotation grip stands outside the shape, so it never competes with a body
    // drag and can keep a full finger-sized target even on a zone that is tiny.
    var rad=hs[i].id==='rotate'?HIT:hr;
    var dx=hs[i].x-x,dy=hs[i].y-y,d=dx*dx+dy*dy;
    if(d<=rad*rad&&d<bd){bd=d;best=hs[i];}
  }
  return best;
}

function inside(x,y){
  if(!geom) return false;
  var r=imgRect();
  if(geom.shape==='Rectangle'){
    // Project onto the rectangle's own axes — once untilted it is a plain box test,
    // and at 0 degrees this reduces exactly to the axis-aligned comparison.
    var f=rectFrame(geom),ax=axes(geom);
    var dx=x-f.cx,dy=y-f.cy;
    return Math.abs(dx*ax.ux+dy*ax.uy)<=f.hw && Math.abs(dx*ax.vx+dy*ax.vy)<=f.hh;
  }
  if(geom.shape==='Circle'){
    var p=toScr(geom.cx,geom.cy),rad=geom.radius*Math.min(r.w,r.h);
    return (x-p.x)*(x-p.x)+(y-p.y)*(y-p.y)<=rad*rad;
  }
  if(geom.shape==='Polygon'&&geom.points.length>=3){
    var pts=geom.points.map(function(q){return[r.x+q[0]*r.w,r.y+q[1]*r.h];});
    var hit=false;
    for(var i=0,j=pts.length-1;i<pts.length;j=i++){
      if((pts[i][1]>y)!==(pts[j][1]>y)&&
         x<(pts[j][0]-pts[i][0])*(y-pts[i][1])/(pts[j][1]-pts[i][1])+pts[i][0]) hit=!hit;
    }
    return hit;
  }
  return false;
}

// ── Rendering ────────────────────────────────────────────────────────────────

function render(){
  c.width=c.width;
  if(img.complete&&img.naturalWidth>0){
    var r=imgRect();
    ctx.drawImage(img,r.x,r.y,r.w,r.h);
  }else{
    ctx.fillStyle='#1f2937';ctx.fillRect(0,0,c.width,c.height);
  }
  // The zone being edited is represented by the working geometry, so drawing it
  // from the saved list too would ghost the pre-edit shape underneath.
  zones.forEach(function(z){
    if(z.id===editingId) return;
    ctx.strokeStyle='rgba(34,211,238,0.75)';
    ctx.fillStyle='rgba(34,211,238,0.07)';
    ctx.lineWidth=2;
    drawZone(z.geometry,z.name,ctx.strokeStyle,z.grid);
  });

  ctx.strokeStyle=ORANGE;ctx.lineWidth=2.5;ctx.fillStyle='rgba(249,115,22,0.1)';

  if(geom){
    drawZone(geom,'',ORANGE,grid);
    drawHandles();
  }

  if(drag&&drag.kind==='new'){
    ctx.setLineDash([6,3]);
    if(drawShape==='Rectangle'){
      var x1=Math.min(drag.sx,drag.cx),y1=Math.min(drag.sy,drag.cy);
      var x2=Math.max(drag.sx,drag.cx),y2=Math.max(drag.sy,drag.cy);
      ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.strokeRect(x1,y1,x2-x1,y2-y1);
    }else if(drawShape==='Circle'){
      var rad=Math.sqrt((drag.cx-drag.sx)*(drag.cx-drag.sx)+(drag.cy-drag.sy)*(drag.cy-drag.sy));
      ctx.beginPath();ctx.arc(drag.sx,drag.sy,rad,0,2*Math.PI);ctx.fill();ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if(!editing&&drawShape==='Polygon'&&polyPts.length>0) drawPolyDraft();
}

function drawPolyDraft(){
  ctx.setLineDash([5,3]);
  ctx.beginPath();ctx.moveTo(polyPts[0][0],polyPts[0][1]);
  for(var i=1;i<polyPts.length;i++) ctx.lineTo(polyPts[i][0],polyPts[i][1]);
  if(drag&&drag.kind==='polyhover') ctx.lineTo(drag.cx,drag.cy);
  ctx.stroke();ctx.setLineDash([]);
  polyPts.forEach(function(p){
    ctx.fillStyle=ORANGE;
    ctx.beginPath();ctx.arc(p[0],p[1],5,0,2*Math.PI);ctx.fill();
  });
  if(polyPts.length>=3){
    ctx.globalAlpha=0.35;ctx.beginPath();
    ctx.moveTo(polyPts[polyPts.length-1][0],polyPts[polyPts.length-1][1]);
    ctx.lineTo(polyPts[0][0],polyPts[0][1]);
    ctx.setLineDash([3,3]);ctx.strokeStyle=ORANGE;ctx.stroke();
    ctx.setLineDash([]);ctx.globalAlpha=1;
  }
}

function drawHandles(){
  var hs=handles(),grip=null;
  hs.forEach(function(h){if(h.id==='rotate')grip=h;});

  if(grip){
    // Stem back to the top edge, so the grip reads as attached to the rectangle
    // rather than as a stray dot floating next to it.
    var q=rectCorners(geom);
    ctx.beginPath();
    ctx.moveTo((q[0].x+q[1].x)/2,(q[0].y+q[1].y)/2);
    ctx.lineTo(grip.x,grip.y);
    ctx.strokeStyle=ORANGE;ctx.lineWidth=2;ctx.stroke();
  }

  hs.forEach(function(h){
    var filled=(h.id==='center'||h.id==='rotate');
    ctx.beginPath();ctx.arc(h.x,h.y,7,0,2*Math.PI);
    ctx.fillStyle=filled?ORANGE:'#fff';
    ctx.fill();
    ctx.lineWidth=2.5;ctx.strokeStyle=filled?'#fff':ORANGE;
    ctx.stroke();
  });
}

function drawZone(g,label,color,grid){
  var r=imgRect();ctx.save();
  if(g.shape==='Rectangle'){
    var q=rectCorners(g);
    traceQuad(q);ctx.fill();ctx.stroke();
    // Anchor the label on whichever corner sits highest — on a tilt there is no
    // reliable top-left, and the label would otherwise land across the shape.
    var top=q.slice().sort(function(m,n){return m.y-n.y;})[0];
    ctx.fillStyle=color;ctx.font='bold 12px sans-serif';
    ctx.fillText(label,top.x+4,top.y>16?top.y-4:top.y+14);
  }else if(g.shape==='Circle'){
    var px=r.x+g.cx*r.w,py=r.y+g.cy*r.h,rad=g.radius*Math.min(r.w,r.h);
    ctx.beginPath();ctx.arc(px,py,rad,0,2*Math.PI);ctx.fill();ctx.stroke();
    ctx.fillStyle=color;ctx.font='bold 12px sans-serif';
    ctx.fillText(label,px+4,py-rad-4);
  }else if(g.shape==='Polygon'&&g.points.length>=2){
    ctx.beginPath();
    ctx.moveTo(r.x+g.points[0][0]*r.w,r.y+g.points[0][1]*r.h);
    for(var i=1;i<g.points.length;i++) ctx.lineTo(r.x+g.points[i][0]*r.w,r.y+g.points[i][1]*r.h);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=color;ctx.font='bold 12px sans-serif';
    ctx.fillText(label,r.x+g.points[0][0]*r.w+4,r.y+g.points[0][1]*r.h-4);
  }
  if(grid&&grid.rows*grid.cols>1) drawGrid(g,grid,color);
  ctx.restore();
}

// Screen-space bounding box of a zone — the rectangle its grid is laid out over.
// Mirrors VisionProcessor.ZoneBounds on the controller.
function zoneBounds(g){
  var r=imgRect();
  if(g.shape==='Rectangle'&&rot(g)) return quadBounds(rectCorners(g));
  if(g.shape==='Circle'){
    var rad=g.radius*Math.min(r.w,r.h);
    return{x:r.x+g.cx*r.w-rad,y:r.y+g.cy*r.h-rad,w:rad*2,h:rad*2};
  }
  if(g.shape==='Polygon'&&g.points.length>=3){
    var xs=g.points.map(function(p){return p[0];}),ys=g.points.map(function(p){return p[1];});
    var x0=Math.min.apply(null,xs),x1=Math.max.apply(null,xs);
    var y0=Math.min.apply(null,ys),y1=Math.max.apply(null,ys);
    return{x:r.x+x0*r.w,y:r.y+y0*r.h,w:(x1-x0)*r.w,h:(y1-y0)*r.h};
  }
  return{x:r.x+g.x*r.w,y:r.y+g.y*r.h,w:g.width*r.w,h:g.height*r.h};
}

function drawGrid(g,grid,color){
  ctx.save();
  ctx.strokeStyle=color;ctx.globalAlpha=0.6;ctx.lineWidth=1;ctx.setLineDash([4,3]);

  if(g.shape==='Rectangle'&&rot(g)){
    // Cell by cell, because the lattice turns with the rectangle. The straight-line
    // version below only describes the grid while the box is square to the image.
    for(var rI=0;rI<grid.rows;rI++)
      for(var cI=0;cI<grid.cols;cI++){
        traceQuad(cellQuad(g,grid.rows,grid.cols,rI,cI));
        ctx.stroke();
      }
    ctx.restore();return;
  }

  var b=zoneBounds(g);
  // Interior lines only — the zone outline already draws the perimeter.
  for(var i=1;i<grid.cols;i++){
    var x=b.x+b.w*i/grid.cols;
    ctx.beginPath();ctx.moveTo(x,b.y);ctx.lineTo(x,b.y+b.h);ctx.stroke();
  }
  for(var j=1;j<grid.rows;j++){
    var y=b.y+b.h*j/grid.rows;
    ctx.beginPath();ctx.moveTo(b.x,y);ctx.lineTo(b.x+b.w,y);ctx.stroke();
  }
  ctx.restore();
}

// ── Interaction ──────────────────────────────────────────────────────────────

// Desktop hover feedback (ignored by touch, which never hovers): a point you can grab
// shows the hand, the interior of a finished shape shows the move-grab too, and an
// empty canvas you can draw on shows the crosshair. Kept cheap - a hit test per move.
function hoverCursor(x,y){
  if(drag) return 'grabbing';
  if(editing&&geom){
    if(hitHandle(x,y)) return 'grab';
    if(inside(x,y)) return 'grab';
    return 'default';
  }
  return 'crosshair';
}

function onDown(p){
  // With a shape on the canvas, a stray tap outside it must not start a new one -
  // that is what Clear is for. Only handles and the interior respond.
  if(editing&&geom){
    var h=hitHandle(p.x,p.y);
    if(h){startHandleDrag(h);return;}
    if(inside(p.x,p.y)){
      drag={kind:'body',px:p.x,py:p.y,orig:JSON.parse(JSON.stringify(geom))};
      return;
    }
    return;
  }
  if(drawShape==='Polygon'){
    polyPts.push([p.x,p.y]);
    drag={kind:'polyhover',cx:p.x,cy:p.y};
    render();post();
    return;
  }
  drag={kind:'new',sx:p.x,sy:p.y,cx:p.x,cy:p.y};
  render();
}

function startHandleDrag(h){
  if(h.id==='rotate'){
    drag={kind:'rotate'};
  }else if(geom.shape==='Rectangle'){
    // Anchor the opposite corner and rebuild the rect from it each move. Dragging
    // past the anchor then just flips the rect instead of collapsing it.
    // Corners run clockwise from top-left, so the opposite of each is two along.
    var q=rectCorners(geom);
    var opp={nw:q[2],ne:q[3],se:q[0],sw:q[1]}[h.id];
    drag={kind:'rectcorner',fx:opp.x,fy:opp.y};
  }else if(geom.shape==='Circle'){
    drag={kind:h.id==='center'?'circlemove':'circleradius'};
  }else{
    drag={kind:'vertex',idx:h.id};
  }
}

function onMove(p){
  if(!drag) return;
  var r=imgRect();
  if(drag.kind==='new'||drag.kind==='polyhover'){
    drag.cx=p.x;drag.cy=p.y;
  }else if(drag.kind==='rectcorner'){
    // Measure the new box along the rectangle's own axes rather than the screen's, so
    // a tilted rectangle resizes along its edges and keeps its angle. At 0 degrees the
    // axes are the screen's and this reduces to the plain min/max corner rebuild.
    // Only the dragged corner is clamped; the anchor is already inside the frame.
    var px=Math.max(r.x,Math.min(r.x+r.w,p.x)),py=Math.max(r.y,Math.min(r.y+r.h,p.y));
    var ax=axes(geom),dx=px-drag.fx,dy=py-drag.fy;
    var lw=dx*ax.ux+dy*ax.uy, lh=dx*ax.vx+dy*ax.vy;
    var mid=toNorm(drag.fx+(ax.ux*lw+ax.vx*lh)/2, drag.fy+(ax.uy*lw+ax.vy*lh)/2);
    geom.width =Math.max(0.01,Math.abs(lw)/r.w);
    geom.height=Math.max(0.01,Math.abs(lh)/r.h);
    geom.x=mid.x-geom.width/2;
    geom.y=mid.y-geom.height/2;
  }else if(drag.kind==='rotate'){
    var f=rectFrame(geom);
    // The grip is held off the top edge, so the angle it reports runs a quarter turn
    // ahead of the rectangle's own.
    geom.rotation=snapAngle(Math.atan2(p.y-f.cy,p.x-f.cx)*180/Math.PI+90);
  }else if(drag.kind==='circlemove'){
    var n=toNorm(p.x,p.y);geom.cx=clamp01(n.x);geom.cy=clamp01(n.y);
  }else if(drag.kind==='circleradius'){
    var ctr=toScr(geom.cx,geom.cy);
    var rad=Math.sqrt((p.x-ctr.x)*(p.x-ctr.x)+(p.y-ctr.y)*(p.y-ctr.y));
    geom.radius=Math.max(0.01,rad/Math.min(r.w,r.h));
  }else if(drag.kind==='vertex'){
    var nv=toNorm(p.x,p.y);
    geom.points[drag.idx]=[clamp01(nv.x),clamp01(nv.y)];
  }else if(drag.kind==='body'){
    moveBody(p);
  }
  render();
}

// Move keeps the shape rigid: the delta is clamped so the whole outline stays in
// frame, rather than clamping each point and deforming it against the edge.
function moveBody(p){
  var r=imgRect(),o=drag.orig;
  var dx=(p.x-drag.px)/r.w,dy=(p.y-drag.py)/r.h;
  if(geom.shape==='Rectangle'&&rot(o)){
    // A tilted rectangle reaches past its own width and height, so the delta is bounded
    // by its actual footprint — bounding it by the stated size lets a corner off-frame.
    var cn=rectCorners(o).map(function(pt){return toNorm(pt.x,pt.y);});
    var cxs=cn.map(function(pt){return pt.x;}),cys=cn.map(function(pt){return pt.y;});
    dx=Math.max(-Math.min.apply(null,cxs),Math.min(1-Math.max.apply(null,cxs),dx));
    dy=Math.max(-Math.min.apply(null,cys),Math.min(1-Math.max.apply(null,cys),dy));
    geom.x=o.x+dx;geom.y=o.y+dy;
  }else if(geom.shape==='Rectangle'){
    geom.x=Math.max(0,Math.min(1-o.width,o.x+dx));
    geom.y=Math.max(0,Math.min(1-o.height,o.y+dy));
  }else if(geom.shape==='Circle'){
    geom.cx=clamp01(o.cx+dx);geom.cy=clamp01(o.cy+dy);
  }else{
    var xs=o.points.map(function(q){return q[0];}),ys=o.points.map(function(q){return q[1];});
    dx=Math.max(-Math.min.apply(null,xs),Math.min(1-Math.max.apply(null,xs),dx));
    dy=Math.max(-Math.min.apply(null,ys),Math.min(1-Math.max.apply(null,ys),dy));
    geom.points=o.points.map(function(q){return[q[0]+dx,q[1]+dy];});
  }
}

function onUp(){
  if(!drag) return;
  if(drag.kind==='polyhover'){drag=null;render();return;}
  if(drag.kind==='new'){
    var r=imgRect(),built=null;
    if(drawShape==='Rectangle'){
      var n1=toNorm(Math.min(drag.sx,drag.cx),Math.min(drag.sy,drag.cy));
      var n2=toNorm(Math.max(drag.sx,drag.cx),Math.max(drag.sy,drag.cy));
      var rw=clamp01(n2.x)-clamp01(n1.x),rh=clamp01(n2.y)-clamp01(n1.y);
      if(rw>=0.01&&rh>=0.01)
        built={shape:'Rectangle',x:clamp01(n1.x),y:clamp01(n1.y),width:rw,height:rh,
               rotation:0,cx:0.5,cy:0.5,radius:0.25,points:[]};
    }else if(drawShape==='Circle'){
      var nc=toNorm(drag.sx,drag.sy);
      var rad=Math.sqrt((drag.cx-drag.sx)*(drag.cx-drag.sx)+(drag.cy-drag.sy)*(drag.cy-drag.sy));
      var nr=rad/Math.min(r.w,r.h);
      if(nr>=0.01)
        built={shape:'Circle',x:0,y:0,width:1,height:1,rotation:0,
               cx:clamp01(nc.x),cy:clamp01(nc.y),radius:nr,points:[]};
    }
    drag=null;
    // Too small to be a deliberate drag (usually a tap) - leave the canvas empty
    // rather than creating a zone the user has to notice and undo.
    if(built){geom=built;editing=true;}
    render();post();
    return;
  }
  drag=null;render();post();
}

c.addEventListener('pointerdown',function(e){
  e.preventDefault();
  try{c.setPointerCapture(e.pointerId);}catch(err){}
  onDown({x:e.clientX,y:e.clientY});
  // A drag that grabbed a handle or the body reads as grabbing; a fresh draw stays crosshair.
  if(drag&&drag.kind!=='new'&&drag.kind!=='polyhover') c.style.cursor='grabbing';
},{passive:false});

c.addEventListener('pointermove',function(e){
  if(drag){e.preventDefault();onMove({x:e.clientX,y:e.clientY});return;}
  // Not dragging: just update the hover cursor so the mouse tells you what a point does.
  c.style.cursor=hoverCursor(e.clientX,e.clientY);
},{passive:false});

c.addEventListener('pointerup',function(e){e.preventDefault();onUp();c.style.cursor=hoverCursor(e.clientX,e.clientY);},{passive:false});
c.addEventListener('pointercancel',function(){onUp();c.style.cursor='default';},{passive:false});

post();
<\/script>
</body></html>`;
}

// Accepts ws:// URLs (WebSocket push) or http:// URLs (snapshot poll fallback).
// Mounted once by the feed WebView; URL updates are injected via injectJavaScript.
export const FEED_HTML = `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0}html,body{width:100%;height:100%;background:#111;overflow:hidden}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain}
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
var c=document.getElementById('c'),ctx=c.getContext('2d');
var _ws=null,_timer=null,_lastUrl=null,_gen=0;

// Zone outlines drawn over every frame, so every declared zone is visible whether or
// not an inspection uses it. The host pushes the zones in and toggles them; the canvas
// is the image at natural size, so normalized zone coords map straight to it.
var _zones=[],_zonesVisible=true;
window.setZones=function(z){_zones=z||[];};
window.setZonesVisible=function(v){_zonesVisible=!!v;};
function drawZones(){
  if(!_zonesVisible||!_zones.length||!c.width||!c.height)return;
  var W=c.width,H=c.height,m=Math.min(W,H);
  ctx.save();
  ctx.lineWidth=Math.max(2,Math.round(m*0.005));
  ctx.strokeStyle='#22d3ee';
  for(var i=0;i<_zones.length;i++){
    var g=_zones[i].geometry;if(!g)continue;
    if(g.shape==='Circle'){
      ctx.beginPath();ctx.arc(g.cx*W,g.cy*H,g.radius*m,0,2*Math.PI);ctx.stroke();
    }else if(g.shape==='Polygon'&&g.points&&g.points.length>=2){
      ctx.beginPath();ctx.moveTo(g.points[0][0]*W,g.points[0][1]*H);
      for(var j=1;j<g.points.length;j++)ctx.lineTo(g.points[j][0]*W,g.points[j][1]*H);
      ctx.closePath();ctx.stroke();
    }else{
      var x=g.x*W,y=g.y*H,w=g.width*W,h=g.height*H,rot=(g.rotation||0)*Math.PI/180;
      if(rot){ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(rot);ctx.strokeRect(-w/2,-h/2,w,h);ctx.restore();}
      else{ctx.strokeRect(x,y,w,h);}
    }
  }
  ctx.restore();
}

// Each setFeed bumps the generation; only the current generation is allowed to
// draw, so a just-closed feed (e.g. the raw camera socket while switching to the
// annotated vision socket) can't paint stale frames and cause flicker.
function closeWs(){if(_ws){try{_ws.onmessage=null;_ws.close();}catch(e){}_ws=null;}}
function stopTimer(){if(_timer){clearInterval(_timer);_timer=null;}}

function drawSrc(src,cb,g){
  var img=new Image();
  img.onload=function(){
    // Drop a frame whose feed was replaced while it was still decoding.
    if(g===undefined||g===_gen){
      if(c.width!==img.naturalWidth||c.height!==img.naturalHeight){
        c.width=img.naturalWidth||1;c.height=img.naturalHeight||1;
      }
      ctx.drawImage(img,0,0);drawZones();
    }
    if(cb)cb();
  };
  img.onerror=function(){if(cb)cb();};
  img.src=src;
}

function startWs(url,g){
  var dec=false,pend=null;
  function step(src){dec=true;drawSrc(src,function(){dec=false;if(pend!==null){var n=pend;pend=null;step(n);}},g);}
  _ws=new WebSocket(url);
  _ws.onmessage=function(e){if(g!==_gen)return;if(dec){pend=e.data;}else{step(e.data);}};
  _ws.onerror=function(){_ws=null;};
  _ws.onclose=function(){_ws=null;};
}

function startPoll(url,ms,g){
  var busy=false;
  function load(){
    if(g!==_gen||!url||busy)return;
    busy=true;
    var img=new Image();
    img.onload=function(){
      if(g!==_gen){busy=false;return;}
      if(c.width!==img.naturalWidth||c.height!==img.naturalHeight){
        c.width=img.naturalWidth||1;c.height=img.naturalHeight||1;
      }
      ctx.drawImage(img,0,0);drawZones();busy=false;
    };
    img.onerror=function(){busy=false;};
    img.src=url+'?_='+Date.now();
  }
  load();_timer=setInterval(load,ms||150);
}

window.setFeed=function(url){
  _gen++;var g=_gen;
  _lastUrl=url;closeWs();stopTimer();
  if(!url)return;
  if(url.startsWith('ws://')||url.startsWith('wss://'))startWs(url,g);
  else startPoll(url,150,g);
};
window.pauseFeed=function(){_gen++;closeWs();stopTimer();};
window.resumeFeed=function(){if(_lastUrl)window.setFeed(_lastUrl);};
<\/script>
</body></html>`;

export function makeColorPickHtml(imageUri: string): string {
  return `<!DOCTYPE html><html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#000;overflow:hidden;touch-action:none}
canvas{display:block;position:absolute;top:0;left:0;width:100%;height:100%;touch-action:none}
#ring{position:fixed;width:28px;height:28px;border:2px solid #fff;border-radius:50%;pointer-events:none;display:none;transform:translate(-50%,-50%);box-shadow:0 0 0 2px #000}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="ring"></div>
<script>
var c=document.getElementById('c'),ctx=c.getContext('2d');
var ring=document.getElementById('ring');
var offCanvas=null,offCtx=null;
var imgRect={x:0,y:0,w:0,h:0};

function resize(){c.width=window.innerWidth;c.height=window.innerHeight;}
window.addEventListener('resize',function(){resize();render();});
resize();

function render(){
  ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);
  if(!offCanvas)return;
  var scale=Math.min(c.width/offCanvas.width,c.height/offCanvas.height);
  var dw=offCanvas.width*scale,dh=offCanvas.height*scale;
  var dx=(c.width-dw)/2,dy=(c.height-dh)/2;
  imgRect={x:dx,y:dy,w:dw,h:dh};
  ctx.drawImage(offCanvas,dx,dy,dw,dh);
}

var img=new Image();
img.onload=function(){
  offCanvas=document.createElement('canvas');
  offCanvas.width=img.naturalWidth||640;
  offCanvas.height=img.naturalHeight||480;
  offCtx=offCanvas.getContext('2d');
  offCtx.drawImage(img,0,0);
  render();
};
img.src=${JSON.stringify(imageUri)};

function pickAt(cx,cy){
  if(!offCtx)return;
  if(cx<imgRect.x||cx>imgRect.x+imgRect.w||cy<imgRect.y||cy>imgRect.y+imgRect.h)return;
  var px=Math.round((cx-imgRect.x)/imgRect.w*offCanvas.width);
  var py=Math.round((cy-imgRect.y)/imgRect.h*offCanvas.height);
  px=Math.max(0,Math.min(offCanvas.width-1,px));
  py=Math.max(0,Math.min(offCanvas.height-1,py));
  var d=offCtx.getImageData(px,py,1,1).data;
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'color',r:d[0],g:d[1],b:d[2]}))}catch(e){}
}

c.addEventListener('click',function(e){pickAt(e.clientX,e.clientY);},{passive:true});
c.addEventListener('touchend',function(e){
  ring.style.display='none';
  var t=e.changedTouches[0];
  pickAt(t.clientX,t.clientY);
},{passive:true});
c.addEventListener('touchmove',function(e){
  ring.style.display='block';
  ring.style.left=e.touches[0].clientX+'px';
  ring.style.top=e.touches[0].clientY+'px';
},{passive:true});
<\/script>
</body></html>`;
}
