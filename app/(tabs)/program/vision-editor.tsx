import { SubPageHeader } from "@/src/components/ui/SubPageHeader";
import {
  BlobDetectionParams,
  BlobInspection,
  CameraState,
  ColorCoverageInspection,
  ColorEntry,
  VisionProgram,
  VisionZone,
  VisionZoneGeometry,
  VisionZoneShape,
  defaultBlobParams,
  defaultColorEntry,
  defaultColorCoverageInspection,
} from "@/src/models/robotModels";
import { robotClient } from "@/src/services/RobotConnectService";
import { useLocalSearchParams, useNavigation } from "expo-router";
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Palette,
  Pencil,
  Plus,
  ScanSearch,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

// ── Zone-draw canvas HTML ──────────────────────────────────────────────────────

function makeZoneDrawHtml(
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

// ── Feed canvas HTML (mounted once, URL updated via injectJavaScript) ─────────
// Accepts ws:// URLs (WebSocket push) or http:// URLs (snapshot poll fallback).

const FEED_HTML = `<!DOCTYPE html><html>
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
var _ws=null,_timer=null;

function closeWs(){if(_ws){try{_ws.close();}catch(e){}_ws=null;}}
function stopTimer(){if(_timer){clearInterval(_timer);_timer=null;}}

function drawSrc(src){
  var img=new Image();
  img.onload=function(){
    if(c.width!==img.naturalWidth||c.height!==img.naturalHeight){
      c.width=img.naturalWidth||1;c.height=img.naturalHeight||1;
    }
    ctx.drawImage(img,0,0);
  };
  img.src=src;
}

function startWs(url){
  _ws=new WebSocket(url);
  _ws.onmessage=function(e){drawSrc(e.data);};
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
  closeWs();stopTimer();
  if(!url)return;
  if(url.startsWith('ws://')||url.startsWith('wss://'))startWs(url);
  else startPoll(url,150);
};
<\/script>
</body></html>`;

// ── Blob params panel ──────────────────────────────────────────────────────────

function ParamRow({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <View style={styles.paramRow}>
      <Text style={styles.paramLabel}>{label}</Text>
      <TextInput
        style={styles.paramInput}
        keyboardType="numeric"
        value={String(value)}
        onChangeText={t => { const n = parseFloat(t); if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n))); }}
      />
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.paramRow}>
      <Text style={styles.paramLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: "#0891b2" }} />
    </View>
  );
}

function BlobParamsPanel({ params, onUpdate }: { params: BlobDetectionParams; onUpdate: (p: BlobDetectionParams) => void }) {
  function upd(patch: Partial<BlobDetectionParams>) { onUpdate({ ...params, ...patch }); }
  return (
    <View style={styles.blobPanel}>
      <Text style={styles.blobPanelTitle}>Blob Detection</Text>
      <ParamRow label="Min Area"      value={params.minArea}      min={1}   max={999999} onChange={v => upd({ minArea: v })} />
      <ParamRow label="Max Area"      value={params.maxArea}      min={1}   max={999999} onChange={v => upd({ maxArea: v })} />
      <ParamRow label="Min Threshold" value={params.minThreshold} min={0}   max={255}    onChange={v => upd({ minThreshold: v })} />
      <ParamRow label="Max Threshold" value={params.maxThreshold} min={0}   max={255}    onChange={v => upd({ maxThreshold: v })} />
      <ToggleRow label="Filter by Color"       value={params.filterByColor}       onChange={v => upd({ filterByColor: v })} />
      {params.filterByColor && (
        <ParamRow label="Blob Color (0=dark)" value={params.blobColor} min={0} max={255} onChange={v => upd({ blobColor: v })} />
      )}
      <ToggleRow label="Filter by Circularity" value={params.filterByCircularity} onChange={v => upd({ filterByCircularity: v })} />
      {params.filterByCircularity && (
        <ParamRow label="Min Circularity" value={params.minCircularity} min={0} max={1} onChange={v => upd({ minCircularity: v })} />
      )}
      <ToggleRow label="Filter by Convexity"   value={params.filterByConvexity}   onChange={v => upd({ filterByConvexity: v })} />
      {params.filterByConvexity && (
        <ParamRow label="Min Convexity" value={params.minConvexity} min={0} max={1} onChange={v => upd({ minConvexity: v })} />
      )}
      <ToggleRow label="Filter by Inertia"     value={params.filterByInertia}     onChange={v => upd({ filterByInertia: v })} />
      {params.filterByInertia && (
        <ParamRow label="Min Inertia Ratio" value={params.minInertiaRatio} min={0} max={1} onChange={v => upd({ minInertiaRatio: v })} />
      )}
    </View>
  );
}

// ── Camera picker modal ────────────────────────────────────────────────────────

function CameraPickerModal({ visible, cameras, selected, onSelect, onClose }: {
  visible: boolean; cameras: CameraState[]; selected: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Select Camera</Text>
          {cameras.length === 0 ? (
            <Text style={styles.sheetEmpty}>No cameras configured</Text>
          ) : cameras.map(cam => (
            <TouchableOpacity
              key={cam.id}
              style={[styles.sheetRow, cam.id === selected && styles.sheetRowActive]}
              onPress={() => { onSelect(cam.id); onClose(); }}
            >
              <View style={[styles.dot, { backgroundColor: cam.connected ? "#22c55e" : "#d1d5db" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowName}>{cam.name || cam.id}</Text>
                <Text style={styles.sheetRowSub}>{cam.id} · {cam.width}×{cam.height}</Text>
              </View>
              {cam.id === selected && <Check size={16} color="#0891b2" />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Zone picker modal ──────────────────────────────────────────────────────────

function ZonePickerModal({ visible, zones, selected, onSelect, onClose }: {
  visible: boolean; zones: VisionZone[]; selected: string | null;
  onSelect: (id: string | null) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Select Zone</Text>
          <TouchableOpacity
            style={[styles.sheetRow, selected === null && styles.sheetRowActive]}
            onPress={() => { onSelect(null); onClose(); }}
          >
            <View style={[styles.dot, { backgroundColor: "#9ca3af" }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowName}>None — full image</Text>
              <Text style={styles.sheetRowSub}>All blobs in frame are reported</Text>
            </View>
            {selected === null && <Check size={16} color="#0891b2" />}
          </TouchableOpacity>
          {zones.map(zone => (
            <TouchableOpacity
              key={zone.id}
              style={[styles.sheetRow, zone.id === selected && styles.sheetRowActive]}
              onPress={() => { onSelect(zone.id); onClose(); }}
            >
              <View style={[styles.dot, { backgroundColor: "#22d3ee" }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowName}>{zone.name}</Text>
                <Text style={styles.sheetRowSub}>{zone.geometry.shape}</Text>
              </View>
              {zone.id === selected && <Check size={16} color="#0891b2" />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Color pick canvas HTML ─────────────────────────────────────────────────────

function makeColorPickHtml(imageUri: string): string {
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

// ── Color pick modal ───────────────────────────────────────────────────────────

function ColorPickModal({ visible, snapshotUri, onPick, onClose }: {
  visible: boolean;
  snapshotUri: string | null;
  onPick: (r: number, g: number, b: number) => void;
  onClose: () => void;
}) {
  const html = snapshotUri ? makeColorPickHtml(snapshotUri) : null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Tap to pick a color</Text>
          <TouchableOpacity onPress={onClose}
            style={{ backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {html ? (
            <WebView source={{ html }} scrollEnabled={false} originWhitelist={['*']} javaScriptEnabled
              onMessage={e => {
                try {
                  const msg = JSON.parse(e.nativeEvent.data);
                  if (msg.type === 'color') { onPick(msg.r, msg.g, msg.b); onClose(); }
                } catch {}
              }}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#9ca3af' }}>No snapshot — select a camera first</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Color entry editor modal ───────────────────────────────────────────────────

function ColorEditModal({ visible, entry, onSave, onClose, snapshotUri, onFetchSnapshot }: {
  visible: boolean;
  entry: ColorEntry | null;
  onSave: (updated: ColorEntry) => void;
  onClose: () => void;
  snapshotUri: string | null;
  onFetchSnapshot: () => Promise<void>;
}) {
  const [r, setR] = useState(128);
  const [g, setG] = useState(128);
  const [b, setB] = useState(128);
  const [tol, setTol] = useState(20);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    if (entry && visible) { setR(entry.r); setG(entry.g); setB(entry.b); setTol(entry.tolerance); }
  }, [entry, visible]);

  async function openPick() {
    await onFetchSnapshot();
    setPickOpen(true);
  }

  function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, Math.round(v))); }

  function ChannelRow({ label, value, onChange, accent }: { label: string; value: number; onChange: (n: number) => void; accent: string }) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: accent, width: 16 }}>{label}</Text>
        <View style={{ flex: 1, height: 6, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${(value / 255) * 100}%`, height: '100%', backgroundColor: accent, borderRadius: 3 }} />
        </View>
        <TextInput
          style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, color: '#111827', width: 52, textAlign: 'right' }}
          keyboardType="numeric"
          value={String(value)}
          onChangeText={t => { const n = parseInt(t, 10); if (!isNaN(n)) onChange(clamp(n, 0, 255)); }}
        />
      </View>
    );
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={[styles.sheet, { paddingBottom: 20 }]} activeOpacity={1} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Color Entry</Text>

            {/* Preview swatch */}
            <View style={{ alignSelf: 'center', marginBottom: 14, gap: 8, alignItems: 'center' }}>
              <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: `rgb(${r},${g},${b})`,
                borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }} />
              <TouchableOpacity onPress={openPick} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: '#0891b2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Pick from Camera</Text>
              </TouchableOpacity>
            </View>

            <ChannelRow label="R" value={r} onChange={setR} accent="#dc2626" />
            <ChannelRow label="G" value={g} onChange={setG} accent="#16a34a" />
            <ChannelRow label="B" value={b} onChange={setB} accent="#2563eb" />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#6b7280', width: 70 }}>Tolerance</Text>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: '#111827' }}
                keyboardType="numeric"
                value={String(tol)}
                onChangeText={t => { const n = parseInt(t, 10); if (!isNaN(n)) setTol(clamp(n, 0, 100)); }}
              />
              <Text style={{ fontSize: 11, color: '#9ca3af' }}>/ 100</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, marginBottom: 14 }}>
              0 = exact match · 100 = very loose
            </Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={onClose} activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#6b7280' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (entry) onSave({ ...entry, r, g, b, tolerance: tol }); onClose(); }}
                activeOpacity={0.75}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 8, backgroundColor: '#0891b2', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <ColorPickModal
        visible={pickOpen}
        snapshotUri={snapshotUri}
        onPick={(pr, pg, pb) => { setR(pr); setG(pg); setB(pb); }}
        onClose={() => setPickOpen(false)}
      />
    </>
  );
}

// ── Zone draw modal ────────────────────────────────────────────────────────────

function ZoneDrawModal({ visible, snapshotUri, zones, editingZoneId, onDone, onCancel }: {
  visible: boolean;
  snapshotUri: string | null;
  zones: VisionZone[];
  editingZoneId: string | null;
  onDone: (geometry: VisionZoneGeometry) => void;
  onCancel: () => void;
}) {
  const insets                          = useSafeAreaInsets();
  const [shape, setShape]               = useState<VisionZoneShape>('Rectangle');
  const [polyReady, setPolyReady]       = useState(false);
  const webviewRef                      = useRef<any>(null);

  useEffect(() => {
    if (visible) { setShape('Rectangle'); setPolyReady(false); }
  }, [visible]);

  function changeShape(s: VisionZoneShape) {
    setShape(s);
    setPolyReady(false);
    webviewRef.current?.injectJavaScript(`window.setShape(${JSON.stringify(s)});true;`);
  }

  function onMessage(e: any) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'zone' && msg.geometry) {
        onDone(msg.geometry as VisionZoneGeometry);
      } else if (msg.type === 'polypts') {
        setPolyReady(msg.count >= 3);
      }
    } catch {}
  }

  function finishPolygon() {
    webviewRef.current?.injectJavaScript(`window.finishPolygon();true;`);
  }

  const html = snapshotUri
    ? makeZoneDrawHtml(snapshotUri, zones, editingZoneId, shape)
    : null;

  const SHAPES: { shape: VisionZoneShape; label: string }[] = [
    { shape: 'Rectangle', label: 'Rect' },
    { shape: 'Circle',    label: 'Circle' },
    { shape: 'Polygon',   label: 'Polygon' },
  ];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.drawModalRoot}>
        {html ? (
          <WebView
            ref={webviewRef}
            source={{ html }}
            style={StyleSheet.absoluteFill}
            scrollEnabled={false}
            originWhitelist={["*"]}
            javaScriptEnabled
            onMessage={onMessage}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#6b7280', fontSize: 14 }}>
              Select a camera above to load a snapshot for zone drawing.
            </Text>
          </View>
        )}

        {/* Hint text — top, below status bar */}
        <View style={styles.drawHint} pointerEvents="none">
          <Text style={styles.drawHintText}>
            {shape === 'Rectangle' ? 'Drag to draw a rectangle' :
             shape === 'Circle'    ? 'Drag from center outward' :
             polyReady             ? 'Tap Finish or keep adding points' :
                                    'Tap to add points (need 3+)'}
          </Text>
        </View>

        {/* Bottom toolbar */}
        <View style={styles.drawToolbar} pointerEvents="box-none">
          <View style={[styles.drawToolbarInner, { paddingBottom: insets.bottom || 10 }]}>
            <TouchableOpacity onPress={onCancel} style={styles.drawCancelBtn}>
              <Text style={styles.drawCancelText}>Cancel</Text>
            </TouchableOpacity>

            <View style={styles.drawShapeRow}>
              {SHAPES.map(({ shape: s, label }) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.drawShapeChip, shape === s && styles.drawShapeChipActive]}
                  onPress={() => changeShape(s)}
                >
                  <Text style={[styles.drawShapeText, shape === s && styles.drawShapeTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {shape === 'Polygon' && polyReady && (
              <TouchableOpacity onPress={finishPolygon} style={styles.drawFinishBtn}>
                <Text style={styles.drawFinishText}>Finish</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Shared inspection discriminated union ──────────────────────────────────────

type InspItem =
  | { kind: 'blob';  insp: BlobInspection }
  | { kind: 'color'; insp: ColorCoverageInspection };

// ── Inspection type picker ─────────────────────────────────────────────────────

function InspectionTypePicker({
  visible, onSelect, onClose,
}: {
  visible: boolean;
  onSelect: (kind: 'blob' | 'color') => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Add Inspection</Text>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => { onSelect('blob'); onClose(); }}
            activeOpacity={0.75}
          >
            <View style={styles.typePickerIcon}>
              <ScanSearch size={18} color="#0891b2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowName}>Blob Detection</Text>
              <Text style={styles.sheetRowSub}>Detect and count objects by shape</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => { onSelect('color'); onClose(); }}
            activeOpacity={0.75}
          >
            <View style={[styles.typePickerIcon, { backgroundColor: '#fdf4ff' }]}>
              <Palette size={18} color="#d946ef" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowName}>Color Coverage</Text>
              <Text style={styles.sheetRowSub}>Measure pixel color percentage in a zone</Text>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Inspection config modal ────────────────────────────────────────────────────

function InspectionConfigModal({
  visible, kind, initialBlob, initialColor, zones,
  snapshotUri, onFetchSnapshot, onSaveBlob, onSaveColor, onClose,
}: {
  visible: boolean;
  kind: 'blob' | 'color' | null;
  initialBlob: BlobInspection | null;
  initialColor: ColorCoverageInspection | null;
  zones: VisionZone[];
  snapshotUri: string | null;
  onFetchSnapshot: () => Promise<void>;
  onSaveBlob: (insp: BlobInspection) => void;
  onSaveColor: (insp: ColorCoverageInspection) => void;
  onClose: () => void;
}) {
  const [name, setName]               = useState('');
  const [enabled, setEnabled]         = useState(true);
  const [zoneId, setZoneId]           = useState<string | null>(null);
  const [blobParams, setBlobParams]   = useState<BlobDetectionParams>(defaultBlobParams());
  const [colors, setColors]           = useState<ColorEntry[]>([]);
  const [minCoverage, setMinCoverage] = useState<number | null>(null);
  const [maxCoverage, setMaxCoverage] = useState<number | null>(null);
  const [zonePickerOpen, setZonePickerOpen]   = useState(false);
  const [colorEditState, setColorEditState]   = useState<{ entry: ColorEntry } | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (kind === 'blob' && initialBlob) {
      setName(initialBlob.name);
      setEnabled(initialBlob.enabled);
      setZoneId(initialBlob.zoneId);
      setBlobParams({ ...initialBlob.blobParams });
    } else if (kind === 'color' && initialColor) {
      setName(initialColor.name);
      setEnabled(initialColor.enabled);
      setZoneId(initialColor.zoneId);
      setColors([...initialColor.colors]);
      setMinCoverage(initialColor.minCoverage);
      setMaxCoverage(initialColor.maxCoverage);
    }
  }, [visible, kind, initialBlob, initialColor]);

  function handleClose() {
    if (kind === 'blob' && initialBlob) {
      onSaveBlob({ ...initialBlob, name, enabled, zoneId, blobParams });
    } else if (kind === 'color' && initialColor) {
      onSaveColor({ ...initialColor, name, enabled, zoneId, colors, minCoverage, maxCoverage });
    }
    onClose();
  }

  const linkedZone = zones.find(z => z.id === zoneId);
  const accent     = kind === 'blob' ? '#0891b2' : '#d946ef';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <SafeAreaView style={styles.configRoot}>
        <View style={styles.configHeader}>
          <Text style={styles.configTitle}>
            {kind === 'blob' ? 'Blob Detection' : 'Color Coverage'}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.configDoneBtn}>
            <Check size={15} color="#fff" />
            <Text style={styles.configDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Name */}
          <View style={styles.configCard}>
            <Text style={styles.configFieldLabel}>Name</Text>
            <TextInput
              style={styles.configNameInput}
              value={name}
              onChangeText={setName}
              placeholder="Inspection name"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Enabled */}
          <View style={styles.configCard}>
            <Text style={[styles.configFieldLabel, { flex: 1 }]}>Enabled</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: accent }} />
          </View>

          {/* Zone */}
          <TouchableOpacity
            style={styles.configCard}
            onPress={() => setZonePickerOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={styles.configFieldLabel}>Zone</Text>
            <Text style={{ flex: 1, fontSize: 14, color: '#111827' }}>
              {linkedZone?.name ?? 'Full image'}
            </Text>
            <ChevronDown size={15} color="#9ca3af" />
          </TouchableOpacity>

          {/* Blob params */}
          {kind === 'blob' && (
            <BlobParamsPanel params={blobParams} onUpdate={setBlobParams} />
          )}

          {/* Color coverage */}
          {kind === 'color' && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>COLORS TO MATCH</Text>

              {colors.length === 0 && (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No colors yet — add at least one</Text>
                </View>
              )}

              {colors.map(ce => (
                <TouchableOpacity
                  key={ce.id}
                  style={styles.colorEntryRow}
                  onPress={() => setColorEditState({ entry: ce })}
                  activeOpacity={0.75}
                >
                  <View style={{
                    width: 28, height: 28, borderRadius: 6,
                    backgroundColor: `rgb(${ce.r},${ce.g},${ce.b})`,
                    borderWidth: 1, borderColor: '#d1d5db',
                  }} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#374151' }}>
                    rgb({ce.r}, {ce.g}, {ce.b})
                  </Text>
                  <View style={{
                    backgroundColor: '#f0f9ff', borderRadius: 5,
                    paddingHorizontal: 6, paddingVertical: 2,
                    borderWidth: 1, borderColor: '#bae6fd',
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#0891b2' }}>
                      ±{ce.tolerance}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setColors(prev => prev.filter(c => c.id !== ce.id))}
                    hitSlop={8} style={styles.iconBtn}
                  >
                    <Trash2 size={13} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => setColorEditState({ entry: defaultColorEntry() })}
                activeOpacity={0.75}
              >
                <Plus size={13} color="#d946ef" />
                <Text style={[styles.addBtnText, { color: '#d946ef' }]}>Add Color</Text>
              </TouchableOpacity>

              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>PASS / FAIL THRESHOLDS</Text>

              <View style={styles.configCard}>
                <Switch
                  value={minCoverage !== null}
                  onValueChange={v => setMinCoverage(v ? 50 : null)}
                  trackColor={{ true: '#16a34a' }}
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
                <Text style={{ fontSize: 13, color: '#374151', flex: 1 }}>Min coverage</Text>
                {minCoverage !== null && (
                  <>
                    <TextInput
                      style={[styles.paramInput, { width: 60 }]}
                      keyboardType="numeric"
                      value={String(minCoverage)}
                      onChangeText={t => {
                        const n = parseFloat(t);
                        if (!isNaN(n)) setMinCoverage(Math.min(100, Math.max(0, n)));
                      }}
                    />
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>%</Text>
                  </>
                )}
              </View>

              <View style={styles.configCard}>
                <Switch
                  value={maxCoverage !== null}
                  onValueChange={v => setMaxCoverage(v ? 90 : null)}
                  trackColor={{ true: '#dc2626' }}
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
                <Text style={{ fontSize: 13, color: '#374151', flex: 1 }}>Max coverage</Text>
                {maxCoverage !== null && (
                  <>
                    <TextInput
                      style={[styles.paramInput, { width: 60 }]}
                      keyboardType="numeric"
                      value={String(maxCoverage)}
                      onChangeText={t => {
                        const n = parseFloat(t);
                        if (!isNaN(n)) setMaxCoverage(Math.min(100, Math.max(0, n)));
                      }}
                    />
                    <Text style={{ fontSize: 11, color: '#9ca3af' }}>%</Text>
                  </>
                )}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      <ZonePickerModal
        visible={zonePickerOpen}
        zones={zones}
        selected={zoneId}
        onSelect={id => setZoneId(id)}
        onClose={() => setZonePickerOpen(false)}
      />

      <ColorEditModal
        visible={colorEditState !== null}
        entry={colorEditState?.entry ?? null}
        onSave={entry => {
          setColors(prev => {
            const idx = prev.findIndex(c => c.id === entry.id);
            return idx >= 0
              ? prev.map(c => c.id === entry.id ? entry : c)
              : [...prev, entry];
          });
        }}
        onClose={() => setColorEditState(null)}
        snapshotUri={snapshotUri}
        onFetchSnapshot={onFetchSnapshot}
      />
    </Modal>
  );
}

// ── Main editor screen ─────────────────────────────────────────────────────────

export default function VisionEditorScreen() {
  const params         = useLocalSearchParams<{ program: string; runningIds?: string }>();
  const initialProg    = JSON.parse(params.program) as VisionProgram;
  const initialRunning = params.runningIds ? new Set<string>(JSON.parse(params.runningIds)) : new Set<string>();

  const [program, setProgram]     = useState<VisionProgram>(initialProg);
  const [name, setName]           = useState(initialProg.name);
  const [isRunning, setIsRunning] = useState(initialRunning.has(initialProg.id));
  const [saving, setSaving]       = useState(false);
  const [cameras, setCameras]     = useState<CameraState[]>([]);

  // Modal states
  const [camPickerOpen, setCamPickerOpen] = useState(false);
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [snapshotUri, setSnapshotUri]     = useState<string | null>(null);
  const [configModal, setConfigModal]     = useState<InspItem | null>(null);
  const [typePicker, setTypePicker]       = useState(false);

  // Dirty tracking — ref so the beforeRemove listener never has stale closure values
  const isDirtyRef  = useRef(false);
  const programRef  = useRef(program);
  const nameRef     = useRef(name);
  programRef.current = program;
  nameRef.current    = name;

  function markDirty() { isDirtyRef.current = true; }
  function markClean() { isDirtyRef.current = false; }

  const navigation = useNavigation();
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
          {
            text: 'Save & Leave',
            onPress: async () => {
              const toSave = { ...programRef.current, name: nameRef.current };
              try {
                const result: any = await robotClient.saveVisionProgram(toSave);
                if (result?.programId) {
                  setProgram(prev => ({ ...prev, name: nameRef.current, id: result.programId, lastUpdatedUnixMs: result.lastUpdatedUnixMs }));
                  markClean();
                }
              } catch {}
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
  }, [navigation]);

  // Feed WebView ref — URL updates are injected without rebuilding the WebView
  const feedWebViewRef = useRef<any>(null);

  const feedSourceUrl = useMemo(() => {
    if (isRunning && program.id) return robotClient.visionWsUrl(program.id);
    if (program.cameraId)       return robotClient.cameraWsUrl(program.cameraId);
    return null;
  }, [isRunning, program.id, program.cameraId]);

  const injectFeedUrl = useCallback(() => {
    feedWebViewRef.current?.injectJavaScript(
      `window.setFeed(${JSON.stringify(feedSourceUrl)});true;`
    );
  }, [feedSourceUrl]);

  useEffect(() => { injectFeedUrl(); }, [injectFeedUrl]);

  // Cameras
  useEffect(() => {
    robotClient.getCameras().catch(() => {});
    return robotClient.onCameras(setCameras);
  }, []);

  // Fetch camera snapshot for zone drawing canvas
  const fetchSnapshot = useCallback(async () => {
    const url = program.cameraId ? robotClient.cameraSnapshotUrl(program.cameraId) : null;
    if (!url) { setSnapshotUri(null); return; }
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      await new Promise<void>(resolve => {
        const reader = new FileReader();
        reader.onload  = () => { setSnapshotUri(reader.result as string); resolve(); };
        reader.onerror = () => resolve();
        reader.readAsDataURL(blob);
      });
    } catch { setSnapshotUri(null); }
  }, [program.cameraId]);

  async function openZoneModal(editId?: string) {
    await fetchSnapshot();
    setEditingZoneId(editId ?? null);
    setZoneModalOpen(true);
  }

  function onZoneDrawDone(geometry: VisionZoneGeometry) {
    setZoneModalOpen(false);
    let updated: VisionProgram;
    if (editingZoneId) {
      updated = {
        ...program, name,
        zones: program.zones.map(z => z.id === editingZoneId ? { ...z, geometry } : z),
      };
    } else {
      const newZone: VisionZone = {
        id: `zone_${Date.now()}`,
        name: `Zone ${program.zones.length + 1}`,
        geometry,
      };
      updated = { ...program, name, zones: [...program.zones, newZone] };
    }
    setProgram(updated);
    autoSave(updated);
  }

  async function autoSave(prog: VisionProgram) {
    try {
      const result: any = await robotClient.saveVisionProgram(prog);
      if (result?.programId) {
        setProgram(prev => ({ ...prev, id: result.programId, lastUpdatedUnixMs: result.lastUpdatedUnixMs }));
        markClean();
      }
    } catch { /* silent — user can tap Save manually if disconnected */ }
  }

  function updateZone(updated: VisionZone) {
    setProgram(prev => ({ ...prev, zones: prev.zones.map(z => z.id === updated.id ? updated : z) }));
    markDirty();
  }

  function deleteZone(id: string) {
    setProgram(prev => ({
      ...prev,
      zones: prev.zones.filter(z => z.id !== id),
      inspections: prev.inspections.map(i => i.zoneId === id ? { ...i, zoneId: null } : i),
    }));
    markDirty();
  }

  function updateInspection(updated: BlobInspection) {
    setProgram(prev => ({ ...prev, inspections: prev.inspections.map(i => i.id === updated.id ? updated : i) }));
    markDirty();
  }

  function deleteInspection(id: string) {
    setProgram(prev => ({ ...prev, inspections: prev.inspections.filter(i => i.id !== id) }));
    markDirty();
  }

  function updateColorInspection(updated: ColorCoverageInspection) {
    setProgram(prev => ({
      ...prev,
      colorInspections: (prev.colorInspections ?? []).map(i => i.id === updated.id ? updated : i),
    }));
    markDirty();
  }

  function deleteColorInspection(id: string) {
    setProgram(prev => ({ ...prev, colorInspections: (prev.colorInspections ?? []).filter(i => i.id !== id) }));
    markDirty();
  }

  const allInspections: InspItem[] = [
    ...program.inspections.map(insp => ({ kind: 'blob' as const, insp })),
    ...(program.colorInspections ?? []).map(insp => ({ kind: 'color' as const, insp })),
  ];

  async function save() {
    setSaving(true);
    const toSave: VisionProgram = { ...program, name };
    try {
      const result: any = await robotClient.saveVisionProgram(toSave);
      if (result?.programId) {
        setProgram(prev => ({ ...prev, name, id: result.programId, lastUpdatedUnixMs: result.lastUpdatedUnixMs }));
        markClean();
      }
    } catch {
      Alert.alert("Save Failed", "Could not save. Is the robot connected?");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRunning() {
    if (!program.id) { Alert.alert("Save First", "Save the program before starting vision."); return; }
    if (isRunning) {
      await robotClient.stopVision(program.id).catch(() => {});
      setIsRunning(false);
    } else {
      await robotClient.startVision(program.id).catch(() => {});
      setIsRunning(true);
    }
  }

  const selectedCam = cameras.find(c => c.id === program.cameraId);

  return (
    <View style={styles.root}>
      <SubPageHeader
        title={name}
        subtitle={program.id ? undefined : "Unsaved"}
        right={
          <TouchableOpacity
            onPress={save}
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            disabled={saving}
          >
            <Check size={15} color="#fff" />
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Name</Text>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={t => { setName(t); markDirty(); }}
            placeholder="Program name"
            placeholderTextColor="#9ca3af"
          />
        </View>

        {/* Camera */}
        <TouchableOpacity style={styles.card} onPress={() => setCamPickerOpen(true)} activeOpacity={0.75}>
          <Text style={styles.rowLabel}>Camera</Text>
          <View style={[styles.dot, { backgroundColor: selectedCam?.connected ? "#22c55e" : "#d1d5db" }]} />
          <Text style={styles.cameraValue} numberOfLines={1}>
            {selectedCam ? (selectedCam.name || selectedCam.id) : (program.cameraId || "Tap to select")}
          </Text>
          <ChevronDown size={15} color="#9ca3af" />
        </TouchableOpacity>

        {/* Camera feed — WebView canvas updates in-place, no flicker */}
        <View style={styles.feedCard} pointerEvents="none">
          <WebView
            ref={feedWebViewRef}
            source={{ html: FEED_HTML }}
            style={{ flex: 1, backgroundColor: "#111" }}
            scrollEnabled={false}
            originWhitelist={["*"]}
            javaScriptEnabled
            focusable={false}
            accessible={false}
            onLoad={injectFeedUrl}
          />
          {!feedSourceUrl && (
            <View style={styles.feedPlaceholder}>
              <Text style={styles.feedPlaceholderText}>
                {program.cameraId ? "Connecting to camera…" : "Select a camera above"}
              </Text>
            </View>
          )}
        </View>

        {/* Run / Stop */}
        <TouchableOpacity
          style={[styles.runBtn, isRunning ? styles.runBtnStop : styles.runBtnStart]}
          onPress={toggleRunning}
          activeOpacity={0.8}
        >
          {isRunning ? <EyeOff size={16} color="#fff" /> : <Eye size={16} color="#fff" />}
          <Text style={styles.runBtnText}>{isRunning ? "Stop Vision" : "Start Vision"}</Text>
        </TouchableOpacity>

        {/* ── Zones ──────────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>ZONES</Text>

        {program.zones.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No zones defined — add one to restrict where blobs are counted</Text>
          </View>
        )}

        {program.zones.map(zone => (
          <View key={zone.id} style={styles.zoneCard}>
            <View style={[styles.dot, { backgroundColor: "#22d3ee" }]} />
            <TextInput
              style={styles.zoneNameInput}
              value={zone.name}
              onChangeText={t => updateZone({ ...zone, name: t })}
            />
            <Text style={styles.shapeBadge}>{zone.geometry.shape}</Text>
            <TouchableOpacity onPress={() => openZoneModal(zone.id)} style={styles.iconBtn} hitSlop={8}>
              <Pencil size={14} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteZone(zone.id)} style={styles.iconBtn} hitSlop={8}>
              <Trash2 size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addBtn} onPress={() => openZoneModal()} activeOpacity={0.75}>
          <Plus size={15} color="#0891b2" />
          <Text style={styles.addBtnText}>Add Zone</Text>
        </TouchableOpacity>

        {/* ── Inspections (unified) ────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>INSPECTIONS</Text>

        {allInspections.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No inspections — add one to detect blobs or measure colors</Text>
          </View>
        )}

        {allInspections.map((item, index) => {
          const { kind, insp } = item;
          const linkedZone = program.zones.find(z => z.id === insp.zoneId);
          const accent     = kind === 'blob' ? '#0891b2' : '#d946ef';
          const iconBg     = kind === 'blob' ? '#ecfeff'  : '#fdf4ff';
          const typeLabel  = kind === 'blob' ? 'BLOB DETECTION' : 'COLOR COVERAGE';
          return (
            <View key={insp.id} style={[styles.inspStepCard, { borderLeftColor: accent }]}>
              <TouchableOpacity
                style={styles.inspStepHeader}
                onPress={() => setConfigModal(item)}
                activeOpacity={0.75}
              >
                <View style={[styles.inspStepIcon, { backgroundColor: iconBg }]}>
                  {kind === 'blob'
                    ? <ScanSearch size={18} color={accent} />
                    : <Palette    size={18} color={accent} />
                  }
                </View>
                <View style={styles.inspStepText}>
                  <Text style={[styles.inspStepType, { color: accent }]}>
                    {index + 1} · {typeLabel}
                  </Text>
                  <Text style={styles.inspStepName}>{insp.name}</Text>
                  <Text style={styles.inspStepDetail}>
                    {linkedZone?.name ?? 'Full image'}
                  </Text>
                </View>
                <Switch
                  value={insp.enabled}
                  onValueChange={v => {
                    if (kind === 'blob') updateInspection({ ...(insp as BlobInspection), enabled: v });
                    else updateColorInspection({ ...(insp as ColorCoverageInspection), enabled: v });
                  }}
                  trackColor={{ true: accent }}
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
                <TouchableOpacity
                  onPress={() => {
                    if (kind === 'blob') deleteInspection(insp.id);
                    else deleteColorInspection(insp.id);
                  }}
                  hitSlop={8} style={styles.iconBtn}
                >
                  <Trash2 size={15} color="#ef4444" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addBtn} onPress={() => setTypePicker(true)} activeOpacity={0.75}>
          <Plus size={15} color="#7c3aed" />
          <Text style={[styles.addBtnText, { color: '#7c3aed' }]}>Add Inspection</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modals */}
      <CameraPickerModal
        visible={camPickerOpen}
        cameras={cameras}
        selected={program.cameraId}
        onSelect={id => { setProgram(p => ({ ...p, cameraId: id })); markDirty(); }}
        onClose={() => setCamPickerOpen(false)}
      />

      <ZoneDrawModal
        visible={zoneModalOpen}
        snapshotUri={snapshotUri}
        zones={program.zones}
        editingZoneId={editingZoneId}
        onDone={onZoneDrawDone}
        onCancel={() => setZoneModalOpen(false)}
      />

      <InspectionTypePicker
        visible={typePicker}
        onSelect={kind => {
          const totalCount = program.inspections.length + (program.colorInspections ?? []).length;
          if (kind === 'blob') {
            const newInsp: BlobInspection = {
              id: `insp_${Date.now()}`,
              name: `Inspection ${totalCount + 1}`,
              enabled: true,
              zoneId: null,
              blobParams: defaultBlobParams(),
            };
            setProgram(prev => ({ ...prev, inspections: [...prev.inspections, newInsp] }));
            setConfigModal({ kind: 'blob', insp: newInsp });
            markDirty();
          } else {
            const newInsp = defaultColorCoverageInspection(totalCount);
            setProgram(prev => ({ ...prev, colorInspections: [...(prev.colorInspections ?? []), newInsp] }));
            setConfigModal({ kind: 'color', insp: newInsp });
            markDirty();
          }
        }}
        onClose={() => setTypePicker(false)}
      />

      <InspectionConfigModal
        visible={configModal !== null}
        kind={configModal?.kind ?? null}
        initialBlob={configModal?.kind === 'blob' ? (configModal.insp as BlobInspection) : null}
        initialColor={configModal?.kind === 'color' ? (configModal.insp as ColorCoverageInspection) : null}
        zones={program.zones}
        snapshotUri={snapshotUri}
        onFetchSnapshot={fetchSnapshot}
        onSaveBlob={insp => {
          updateInspection(insp);
          autoSave({ ...program, name, inspections: program.inspections.map(i => i.id === insp.id ? insp : i) });
        }}
        onSaveColor={insp => {
          updateColorInspection(insp);
          autoSave({ ...program, name, colorInspections: (program.colorInspections ?? []).map(i => i.id === insp.id ? insp : i) });
        }}
        onClose={() => setConfigModal(null)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#f3f4f6" },
  scroll:  { flex: 1 },
  content: { padding: 14, gap: 8 },

  saveBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#16a34a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  // Shared card
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowLabel:    { fontSize: 12, fontWeight: "600", color: "#6b7280", width: 60 },
  nameInput:   { flex: 1, fontSize: 14, color: "#111827" },
  cameraValue: { flex: 1, fontSize: 14, color: "#111827" },
  dot:         { width: 8, height: 8, borderRadius: 4 },

  // Camera feed
  feedCard: {
    backgroundColor: "#111", borderRadius: 12, overflow: "hidden",
    height: 220,
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 6, elevation: 3,
  },
  feedPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center", alignItems: "center",
  },
  feedPlaceholderText: { color: "#6b7280", fontSize: 13 },

  // Run/Stop button
  runBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 12, paddingVertical: 13,
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  runBtnStart: { backgroundColor: "#0891b2" },
  runBtnStop:  { backgroundColor: "#dc2626" },
  runBtnText:  { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Section label
  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#6b7280", letterSpacing: 0.8, marginBottom: 2 },

  // Empty placeholder
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16, alignItems: "center",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  emptyText: { fontSize: 13, color: "#9ca3af", textAlign: "center" },

  // Zone card
  zoneCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  zoneNameInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111827" },
  shapeBadge:    { fontSize: 11, color: "#9ca3af", backgroundColor: "#f3f4f6", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  iconBtn:       { padding: 4 },

  // Add button (at bottom of each section)
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#fff", borderRadius: 12,
    paddingVertical: 13, borderWidth: 1.5, borderColor: "#e5e7eb", borderStyle: "dashed",
  },
  addBtnText: { fontSize: 14, fontWeight: "600", color: "#0891b2" },

  // Inspection step cards (unified blob + color)
  inspStepCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    overflow: "hidden",
  },
  inspStepHeader: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: 10, paddingRight: 10, paddingVertical: 14, gap: 10,
  },
  inspStepIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#ecfeff",
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  inspStepText:   { flex: 1, minWidth: 0, gap: 1 },
  inspStepType:   { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  inspStepName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  inspStepDetail: { fontSize: 12, color: "#6b7280" },

  // Type picker icon (in bottom sheet)
  typePickerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#ecfeff",
    justifyContent: "center", alignItems: "center",
  },

  // Inspection config modal
  configRoot: { flex: 1, backgroundColor: "#f3f4f6" },
  configHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb",
  },
  configTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827" },
  configDoneBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#16a34a", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  configDoneBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  configCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  configFieldLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280", width: 60 },
  configNameInput: { flex: 1, fontSize: 14, color: "#111827" },
  colorEntryRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f9fafb", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: "#e5e7eb",
  },

  // Blob panel (used inside InspectionConfigModal)
  blobPanel: {
    padding: 14, gap: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  blobPanelTitle: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 2 },
  paramRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  paramLabel: { flex: 1, fontSize: 13, color: "#374151" },
  paramInput: {
    width: 80, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, textAlign: "right",
    fontSize: 13, color: "#111827",
  },

  // Bottom sheet modals
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, gap: 4,
  },
  sheetTitle:     { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 10 },
  sheetEmpty:     { fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 20 },
  sheetRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10,
  },
  sheetRowActive: { backgroundColor: "#ecfeff" },
  sheetRowName:   { fontSize: 14, fontWeight: "600", color: "#111827" },
  sheetRowSub:    { fontSize: 11, color: "#9ca3af", marginTop: 1 },

  // Zone draw modal
  drawModalRoot: { flex: 1, backgroundColor: "#000" },
  drawToolbar: {
    position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
  },
  drawToolbarInner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  drawCancelBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8,
  },
  drawCancelText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  drawShapeRow:   { flex: 1, flexDirection: "row", gap: 6, justifyContent: "center" },
  drawShapeChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 8,
  },
  drawShapeChipActive: { backgroundColor: "#fff" },
  drawShapeText:       { fontSize: 13, fontWeight: "600", color: "#fff" },
  drawShapeTextActive: { color: "#0891b2" },
  drawFinishBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "#16a34a", borderRadius: 8,
  },
  drawFinishText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  drawHint: {
    position: "absolute", top: 56, left: 0, right: 0, alignItems: "center",
  },
  drawHintText: {
    color: "rgba(255,255,255,0.65)", fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
  },
});
