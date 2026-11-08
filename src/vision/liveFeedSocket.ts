// The live frame socket every camera/vision feed uses (FEED_HTML in visionHtml.ts, CameraLiveFeed's
// WebView document, and CameraLiveFeed on web via startLiveFeedHere), as plain JS to splice into
// those documents.
//
// It used to be a bare `new WebSocket(url)`: once that socket closed (Wi-Fi blip, the app or the
// WebView paused, the controller restarted) or went quiet, the picture stayed frozen on its last
// frame until you left the page. liveFeed() keeps the feed alive by itself:
//  - reconnects when the socket closes, with backoff (0.5 s doubling to 5 s);
//  - asks the controller for status messages (?meta=1): {type:"status",seq,frameAgeMs,source} once a
//    second while no frame goes out, so a quiet socket that still gets status is alive and the camera
//    is what stopped, while a socket that gets nothing for SILENT_MS is dead and is replaced;
//  - against an older controller (no status ever arrives) also reconnects after NOFRAME_MS without a frame;
//  - drops a frame decode that never finished, so one stuck image can't block every later frame;
//  - reconnects at once when the document becomes visible again (and on kick(), which the host calls
//    when the app comes back to the foreground);
//  - reports "No new frames for N s, …" through note(text) while frames are missing (null when fine);
//  - says why it reconnected through log(msg), and tells the controller too (?reconnect=<why>), so
//    each recovery shows in both consoles.
//
// liveFeed(url, {frame(src, done), note(text|null), log(msg)}) returns {close(), kick(why)}.
// frame() gets each data-URI frame and must call done() when it has drawn it (or failed to).
export const LIVE_FEED_JS = `
function liveFeed(url,h){
  var NOTE_MS=3000,SILENT_MS=5000,NOFRAME_MS=10000,DECODE_MS=4000;
  var ws=null,closed=false,retry=0,retryT=null,startAt=Date.now(),openedAt=0,lastMsg=0,lastFrame=0;
  var gotStatus=false,srcAge=-1,srcOk=true,dec=false,decAt=0,pend=null,shown=null;
  function withMeta(why){
    var u=url+(url.indexOf('?')<0?'?':'&')+'meta=1';
    return why?u+'&reconnect='+encodeURIComponent(why):u;
  }
  function drop(){
    if(!ws)return;var w=ws;ws=null;
    try{w.onopen=null;w.onmessage=null;w.onclose=null;w.onerror=null;w.close();}catch(e){}
  }
  function step(src){
    dec=true;decAt=Date.now();
    h.frame(src,function(){dec=false;if(pend!==null){var n=pend;pend=null;step(n);}});
  }
  function open(why){
    if(closed)return;
    if(retryT){clearTimeout(retryT);retryT=null;}
    drop();
    openedAt=lastMsg=Date.now();gotStatus=false;
    if(why)h.log('reconnecting the frame socket: '+why);
    var me;
    try{me=new WebSocket(withMeta(why));}catch(e){schedule('the socket could not open');return;}
    ws=me;
    me.onopen=function(){if(me===ws)retry=0;};
    me.onmessage=function(e){
      if(me!==ws)return;
      lastMsg=Date.now();
      var d=e.data;if(typeof d!=='string')return;
      if(d.charCodeAt(0)===123){
        try{var m=JSON.parse(d);if(m&&m.type==='status'){gotStatus=true;srcAge=m.frameAgeMs;srcOk=m.source!==false;}}catch(x){}
        return;
      }
      lastFrame=lastMsg;srcAge=0;srcOk=true;
      if(dec)pend=d;else step(d);
    };
    me.onclose=function(){if(me!==ws)return;ws=null;schedule('the socket closed');};
  }
  function schedule(why){
    if(closed||retryT)return;
    var ms=Math.min(5000,500*Math.pow(2,retry));retry++;
    retryT=setTimeout(function(){retryT=null;open(why);},ms);
  }
  function setNote(t){if(t!==shown){shown=t;try{h.note(t);}catch(e){}}}
  function tick(){
    if(closed)return;
    var now=Date.now();
    if(dec&&now-decAt>DECODE_MS){dec=false;pend=null;h.log('a frame never finished decoding; skipped it');}
    var gap=now-(lastFrame||startAt);
    var alive=ws&&ws.readyState===1&&now-lastMsg<SILENT_MS;
    if(ws&&ws.readyState===1&&now-lastMsg>=SILENT_MS)open('no data for '+Math.round(SILENT_MS/1000)+' s');
    else if(ws&&ws.readyState===0&&now-openedAt>=SILENT_MS)open('the socket did not open within '+Math.round(SILENT_MS/1000)+' s');
    else if(alive&&!gotStatus&&gap>=NOFRAME_MS&&now-openedAt>=NOFRAME_MS)open('no new frame for '+Math.round(gap/1000)+' s');
    else if(!ws&&!retryT)schedule('the socket was gone');
    if(gap<NOTE_MS){setNote(null);return;}
    var secs=Math.round(gap/1000);
    if(!alive)setNote('No new frames for '+secs+' s, reconnecting\\u2026');
    else if(!srcOk)setNote('No new frames for '+secs+' s, the camera is not there, waiting\\u2026');
    else setNote('No new frames for '+secs+' s, waiting for the camera\\u2026');
  }
  var timer=setInterval(tick,500);
  function kick(why){
    if(closed)return;
    var now=Date.now();
    if(!ws||ws.readyState>1||now-lastMsg>2000){retry=0;open(why||'resumed');}
  }
  function onVis(){if(document.visibilityState==='visible')kick('the page became visible');}
  document.addEventListener('visibilitychange',onVis);
  window.addEventListener('pageshow',onVis);
  open(null);
  return{
    close:function(){closed=true;clearInterval(timer);if(retryT)clearTimeout(retryT);retryT=null;drop();setNote(null);
      document.removeEventListener('visibilitychange',onVis);window.removeEventListener('pageshow',onVis);},
    kick:kick
  };
}
`;

/** JS: showNote(text|null) — the "No new frames…" note over a feed document (liveFeed's note()).
 *  Creates its element on first use, fixed to the viewport so a zoomed canvas doesn't move it. */
export const FEED_NOTE_JS = `
function showNote(t){
  var n=document.getElementById('feednote');
  if(!n){
    if(!t)return;
    n=document.createElement('div');n.id='feednote';
    n.style.cssText='position:fixed;left:50%;bottom:10px;transform:translateX(-50%);max-width:92%;'+
      'padding:5px 10px;border-radius:6px;background:rgba(0,0,0,0.72);color:#fff;'+
      'font:600 12px/1.3 sans-serif;text-align:center;pointer-events:none;z-index:5';
    document.body.appendChild(n);
  }
  if(t){n.textContent=t;n.style.display='block';}else n.style.display='none';
}
`;

export type LiveFeedHandlers = {
  /** Draw one data-URI frame, then call done() (also on failure). */
  frame: (src: string, done: () => void) => void;
  /** "No new frames for N s, …" while frames are missing; null once they flow. */
  note: (text: string | null) => void;
  log: (msg: string) => void;
};
export type LiveFeed = { close: () => void; kick: (why?: string) => void };

let hereFactory: ((url: string, h: LiveFeedHandlers) => LiveFeed) | null = null;

/** Web/Electron: the same liveFeed run in this page (native runs it inside a WebView document). */
export function startLiveFeedHere(url: string, h: LiveFeedHandlers): LiveFeed {
  // new Function: one shared implementation with the WebView documents.
  hereFactory ??= new Function(`${LIVE_FEED_JS}\nreturn liveFeed;`)() as (url: string, h: LiveFeedHandlers) => LiveFeed;
  return hereFactory(url, h);
}
