/**
 * Zoom and pan for the canvas documents in visionHtml.ts, shipped as source because the
 * WebView / iframe documents cannot import modules.
 *
 * `ZoomPan(opts)` owns the pointer events on `opts.el` and keeps one view: a scale `s` and an
 * offset (ox, oy) in CSS pixels, so a point p of the unzoomed view shows at ox + s * p. It never
 * draws — `opts.apply(s, ox, oy)` does. The live feed applies it as a CSS transform on its canvas,
 * so the frame and the overlay drawn into it scale as one picture and stay aligned while new
 * frames keep arriving. The region editor folds it into its own image rectangle instead, so its
 * handles keep their finger size and corners can be dragged while zoomed.
 *
 *   - two fingers: pinch to zoom and pan together (always, when enabled)
 *   - one finger / mouse: given to `opts.down` first (an editor grabbing a handle); if that does
 *     not take it, it pans the zoomed view, and a clean tap goes to `opts.tap`
 *   - wheel / trackpad pinch: zoom about the cursor
 *   - double-tap / double-click: zoom in on the spot, or back to fit (when `opts.dbl` is not false)
 *   - Escape: posts {type:'escape'} so a full-screen host can close
 *
 * While zoom is off (`enabled: false`), gestures do nothing but taps are still reported, so an
 * inline preview keeps scrolling with its page and a tap can still open it full screen.
 * Changes are posted as {type:'zoom', scale} (throttled) for a host that shows the zoom level.
 * `opts.content()` (optional) says where the picture sits in the unzoomed view, for the pan limits.
 */
export const ZOOM_PAN_JS = `
function ZoomPan(o){
  var el=o.el,s=1,ox=0,oy=0,on=o.enabled!==false,max=o.max||8,dblScale=o.dblScale||3;
  var pts={},mode=null,st=null,moved=false,multi=false,lastTap=null,rt=null;
  function count(){var n=0;for(var k in pts)n++;return n;}
  function size(){return{w:window.innerWidth||1,h:window.innerHeight||1};}
  function post(m){try{window.ReactNativeWebView.postMessage(JSON.stringify(m));}catch(e){}}
  function report(){if(rt)return;rt=setTimeout(function(){rt=null;post({type:'zoom',scale:s});},120);}
  // Never smaller than fit. Along each axis the zoomed picture (opts.content(): where the image sits
  // unzoomed, {x,y,w,h}; the whole view by default) fills the view when it is big enough, else stays
  // centred, so a pan never wanders off into the letterbox bars.
  function axis(o0,v,c0,cw){var big=s*cw;return big<=v?(v-big)/2-s*c0:Math.min(-s*c0,Math.max(v-s*(c0+cw),o0));}
  function clamp(){
    if(s<=1.0001){s=1;ox=0;oy=0;return;}
    var z=size(),r=(o.content&&o.content())||{x:0,y:0,w:z.w,h:z.h};
    ox=axis(ox,z.w,r.x,r.w);oy=axis(oy,z.h,r.y,r.h);
  }
  function apply(){clamp();o.apply(s,ox,oy);report();}
  // Zoom to ns keeping the screen point (ax, ay) where it is.
  function zoomAt(ns,ax,ay){ns=Math.max(1,Math.min(max,ns));var k=ns/s;ox=ax-(ax-ox)*k;oy=ay-(ay-oy)*k;s=ns;apply();}
  function pair(){var a=[];for(var k in pts)a.push(pts[k]);
    return{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.max(1,Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y))};}
  function P(e){return{x:e.clientX,y:e.clientY};}

  el.addEventListener('pointerdown',function(e){
    if(e.button===2)return;
    // Only while zoom or an editor wants the pointer: an inline preview must stay scrollable.
    if(e.cancelable&&(on||o.down))e.preventDefault();
    pts[e.pointerId]=P(e);
    try{el.setPointerCapture(e.pointerId);}catch(err){}
    var n=count();
    if(n===1){
      moved=false;multi=false;st={x:e.clientX,y:e.clientY,ox:ox,oy:oy};
      mode=(e.button!==1&&o.down&&o.down(P(e),e))?'del':'pan';
    }else if(n===2&&on){
      // A second finger turns whatever the first one started into a pinch.
      if(mode==='del'&&o.cancel)o.cancel();
      multi=true;var m=pair();mode='pinch';st={m:m,s:s,ox:ox,oy:oy};
    }else{multi=true;}
  },{passive:false});

  el.addEventListener('pointermove',function(e){
    if(!pts[e.pointerId]){if(!count()&&o.hover)o.hover(e);return;}
    pts[e.pointerId]=P(e);
    if(mode==='del'){if(e.cancelable)e.preventDefault();if(o.move)o.move(P(e),e);return;}
    if(mode==='pinch'&&count()>=2){
      if(e.cancelable)e.preventDefault();
      var m=pair(),ns=Math.max(1,Math.min(max,st.s*m.d/st.m.d));
      var ix=(st.m.x-st.ox)/st.s,iy=(st.m.y-st.oy)/st.s;
      s=ns;ox=m.x-ix*ns;oy=m.y-iy*ns;apply();return;
    }
    if(mode==='pan'){
      var dx=e.clientX-st.x,dy=e.clientY-st.y;
      if(Math.abs(dx)+Math.abs(dy)>8)moved=true;
      if(on&&s>1&&moved){if(e.cancelable)e.preventDefault();ox=st.ox+dx;oy=st.oy+dy;apply();}
    }
  },{passive:false});

  function end(e,cancelled){
    if(!pts[e.pointerId])return;
    delete pts[e.pointerId];
    var n=count();
    if(mode==='del'){if(o.up)o.up(P(e),e,cancelled);mode=n?'done':null;return;}
    if(mode==='pan'&&!n&&!moved&&!multi&&!cancelled){
      var now=Date.now(),x=e.clientX,y=e.clientY;
      if(on&&o.dbl!==false&&lastTap&&now-lastTap.t<320&&Math.abs(x-lastTap.x)+Math.abs(y-lastTap.y)<40){
        lastTap=null;
        if(s>1.05){s=1;apply();}else zoomAt(dblScale,x,y);
      }else{
        lastTap={t:now,x:x,y:y};
        if(o.tap)o.tap(x,y);
      }
    }
    // Lifting one finger of a pinch must not turn the other into a sudden pan.
    mode=n?'done':null;
  }
  el.addEventListener('pointerup',function(e){end(e,false);},{passive:true});
  el.addEventListener('pointercancel',function(e){end(e,true);},{passive:true});

  el.addEventListener('wheel',function(e){
    if(!on)return;
    e.preventDefault();
    var dy=e.deltaMode===1?e.deltaY*16:e.deltaY;
    zoomAt(s*Math.exp(-dy*(e.ctrlKey?0.01:0.0015)),e.clientX,e.clientY);
  },{passive:false});

  document.addEventListener('keydown',function(e){if(e.key==='Escape')post({type:'escape'});});
  window.addEventListener('resize',function(){s=1;apply();});

  return{
    setEnabled:function(b){on=!!b;if(!on){s=1;apply();}},
    reset:function(){s=1;apply();},
    zoomBy:function(f){var z=size();zoomAt(s*f,z.w/2,z.h/2);},
    scale:function(){return s;}
  };
}
`;
