import { VisionZone, VisionZoneShape } from "@/src/models/robotModels";

export function makeZoneDrawHtml(
  imageUri: string,
  zones: VisionZone[],
  editingZoneId: string | null,
  activeShape: VisionZoneShape
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
var polyPts=[];
var dragging=false,sx=0,sy=0,cx2=0,cy2=0;

var img=new Image();
img.onload=function(){resize();render();};
img.onerror=function(){resize();render();};
img.src=${JSON.stringify(imageUri)};

function resize(){
  c.width=window.innerWidth;
  c.height=window.innerHeight;
}
window.addEventListener('resize',function(){resize();render();});

window.setShape=function(s){
  drawShape=s;polyPts=[];dragging=false;render();
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'polypts',count:0}));}catch(e){}
};

function imgRect(){
  var iw=img.naturalWidth||1,ih=img.naturalHeight||1;
  var cw=c.width,ch=c.height;
  var scale=Math.min(cw/iw,ch/ih);
  var w=iw*scale,h=ih*scale;
  return{x:(cw-w)/2,y:(ch-h)/2,w:w,h:h};
}
function toNorm(px,py){var r=imgRect();return{x:(px-r.x)/r.w,y:(py-r.y)/r.h};}
function clamp01(v){return Math.max(0,Math.min(1,v));}

function render(){
  c.width=c.width;
  if(img.complete&&img.naturalWidth>0){
    var r=imgRect();
    ctx.drawImage(img,r.x,r.y,r.w,r.h);
  }else{
    ctx.fillStyle='#1f2937';ctx.fillRect(0,0,c.width,c.height);
  }
  zones.forEach(function(z){
    var isEditing=z.id===editingId;
    ctx.strokeStyle=isEditing?'rgba(250,204,21,0.5)':'rgba(34,211,238,0.75)';
    ctx.fillStyle=isEditing?'rgba(250,204,21,0.07)':'rgba(34,211,238,0.07)';
    ctx.lineWidth=2;
    if(isEditing) ctx.setLineDash([6,4]);
    drawZone(z.geometry,z.name,ctx.strokeStyle);
    ctx.setLineDash([]);
  });
  var orange='#f97316';
  ctx.strokeStyle=orange;ctx.lineWidth=2.5;ctx.fillStyle='rgba(249,115,22,0.1)';
  if(drawShape==='Rectangle'&&dragging){
    ctx.setLineDash([6,3]);
    var x1=Math.min(sx,cx2),y1=Math.min(sy,cy2),x2=Math.max(sx,cx2),y2=Math.max(sy,cy2);
    ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.strokeRect(x1,y1,x2-x1,y2-y1);
    ctx.setLineDash([]);
  }
  if(drawShape==='Circle'&&dragging){
    ctx.setLineDash([6,3]);
    var rad=Math.sqrt((cx2-sx)*(cx2-sx)+(cy2-sy)*(cy2-sy));
    ctx.beginPath();ctx.arc(sx,sy,rad,0,2*Math.PI);ctx.fill();ctx.stroke();
    ctx.setLineDash([]);
  }
  if(drawShape==='Polygon'&&polyPts.length>0){
    ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(polyPts[0][0],polyPts[0][1]);
    for(var i=1;i<polyPts.length;i++) ctx.lineTo(polyPts[i][0],polyPts[i][1]);
    if(dragging) ctx.lineTo(cx2,cy2);
    ctx.stroke();ctx.setLineDash([]);
    polyPts.forEach(function(p){
      ctx.fillStyle=orange;
      ctx.beginPath();ctx.arc(p[0],p[1],5,0,2*Math.PI);ctx.fill();
    });
    if(polyPts.length>=3){
      ctx.globalAlpha=0.35;ctx.beginPath();
      ctx.moveTo(polyPts[polyPts.length-1][0],polyPts[polyPts.length-1][1]);
      ctx.lineTo(polyPts[0][0],polyPts[0][1]);
      ctx.setLineDash([3,3]);ctx.strokeStyle=orange;ctx.stroke();
      ctx.setLineDash([]);ctx.globalAlpha=1;
    }
  }
}

function drawZone(g,label,color){
  var r=imgRect();ctx.save();
  if(g.shape==='Rectangle'){
    var x=r.x+g.x*r.w,y=r.y+g.y*r.h,w=g.width*r.w,h=g.height*r.h;
    ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
    ctx.fillStyle=color;ctx.font='bold 12px sans-serif';
    ctx.fillText(label,x+4,y>16?y-4:y+14);
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
  ctx.restore();
}

function getTouchXY(e){
  var t=e.touches&&e.touches.length?e.touches[0]:e.changedTouches[0];
  return{x:t.clientX,y:t.clientY};
}

c.addEventListener('touchstart',function(e){
  e.preventDefault();
  var p=getTouchXY(e);
  cx2=p.x;cy2=p.y;
  if(drawShape==='Polygon'){
    polyPts.push([p.x,p.y]);render();
    try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'polypts',count:polyPts.length}));}catch(e){}
    return;
  }
  sx=p.x;sy=p.y;dragging=true;render();
},{passive:false});

c.addEventListener('touchmove',function(e){
  e.preventDefault();
  var p=getTouchXY(e);cx2=p.x;cy2=p.y;
  if(dragging||drawShape==='Polygon') render();
},{passive:false});

c.addEventListener('touchend',function(e){
  e.preventDefault();
  if(drawShape==='Polygon'||!dragging) return;
  dragging=false;
  var r=imgRect(),geom;
  if(drawShape==='Rectangle'){
    var n1=toNorm(Math.min(sx,cx2),Math.min(sy,cy2));
    var n2=toNorm(Math.max(sx,cx2),Math.max(sy,cy2));
    var rw=clamp01(n2.x-n1.x),rh=clamp01(n2.y-n1.y);
    if(rw<0.01||rh<0.01){render();return;}
    geom={shape:'Rectangle',x:clamp01(n1.x),y:clamp01(n1.y),width:rw,height:rh,cx:0.5,cy:0.5,radius:0.25,points:[]};
  }else if(drawShape==='Circle'){
    var nc=toNorm(sx,sy);
    var rad=Math.sqrt((cx2-sx)*(cx2-sx)+(cy2-sy)*(cy2-sy));
    var nr=rad/Math.min(r.w,r.h);
    if(nr<0.01){render();return;}
    geom={shape:'Circle',x:0,y:0,width:1,height:1,cx:clamp01(nc.x),cy:clamp01(nc.y),radius:Math.max(0.01,nr),points:[]};
  }
  if(geom) try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'zone',geometry:geom}));}catch(err){}
  render();
},{passive:false});

window.finishPolygon=function(){
  if(polyPts.length<3) return;
  var r=imgRect();
  var pts=polyPts.map(function(p){return[clamp01((p[0]-r.x)/r.w),clamp01((p[1]-r.y)/r.h)];});
  var geom={shape:'Polygon',x:0,y:0,width:1,height:1,cx:0.5,cy:0.5,radius:0.25,points:pts};
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'zone',geometry:geom}));}catch(err){}
  polyPts=[];dragging=false;render();
  try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'polypts',count:0}));}catch(err){}
};
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
var _ws=null,_timer=null,_lastUrl=null;

function closeWs(){if(_ws){try{_ws.close();}catch(e){}_ws=null;}}
function stopTimer(){if(_timer){clearInterval(_timer);_timer=null;}}

function drawSrc(src,cb){
  var img=new Image();
  img.onload=function(){
    if(c.width!==img.naturalWidth||c.height!==img.naturalHeight){
      c.width=img.naturalWidth||1;c.height=img.naturalHeight||1;
    }
    ctx.drawImage(img,0,0);
    if(cb)cb();
  };
  img.onerror=function(){if(cb)cb();};
  img.src=src;
}

function startWs(url){
  var dec=false,pend=null;
  function step(src){dec=true;drawSrc(src,function(){dec=false;if(pend!==null){var n=pend;pend=null;step(n);}});}
  _ws=new WebSocket(url);
  _ws.onmessage=function(e){if(dec){pend=e.data;}else{step(e.data);}};
  _ws.onerror=function(){_ws=null;};
  _ws.onclose=function(){_ws=null;};
}

function startPoll(url,ms){
  var busy=false;
  function load(){
    if(!url||busy)return;
    busy=true;
    var img=new Image();
    img.onload=function(){
      if(c.width!==img.naturalWidth||c.height!==img.naturalHeight){
        c.width=img.naturalWidth||1;c.height=img.naturalHeight||1;
      }
      ctx.drawImage(img,0,0);busy=false;
    };
    img.onerror=function(){busy=false;};
    img.src=url+'?_='+Date.now();
  }
  load();_timer=setInterval(load,ms||150);
}

window.setFeed=function(url){
  _lastUrl=url;closeWs();stopTimer();
  if(!url)return;
  if(url.startsWith('ws://')||url.startsWith('wss://'))startWs(url);
  else startPoll(url,150);
};
window.pauseFeed=function(){closeWs();stopTimer();};
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
