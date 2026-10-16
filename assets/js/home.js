/* Home hero: pointer-driven fractal tree. No idle animation under prefers-reduced-motion. */
(function(){
  var cv=document.getElementById('hero-tree'), out=document.getElementById('hero-read'); if(!cv) return;
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var st={angle:30,ratio:0.67}, goal={angle:30,ratio:0.67}, idle=true, t0=performance.now(), raf=0;
  function render(){ FractalTree.draw(cv,{depth:10,angle:st.angle,ratio:st.ratio}); out.textContent='φ '+st.angle.toFixed(1)+'° · r '+st.ratio.toFixed(3); }
  function loop(now){
    if(idle&&!reduce){ var t=(now-t0)/1000; goal.angle=30+9*Math.sin(t*0.45); goal.ratio=0.67+0.025*Math.sin(t*0.31); }
    var da=goal.angle-st.angle, dr=goal.ratio-st.ratio;
    st.angle+=da*0.12; st.ratio+=dr*0.12; render();
    if(idle&&!reduce || Math.abs(da)>0.01||Math.abs(dr)>0.0001) raf=requestAnimationFrame(loop); else raf=0;
  }
  function kick(){ if(!raf) raf=requestAnimationFrame(loop); }
  function move(e){ var r=cv.getBoundingClientRect(); var x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
    x=Math.min(1,Math.max(0,x)); y=Math.min(1,Math.max(0,y));
    idle=false; goal.angle=8+x*80; goal.ratio=0.74-y*0.2; if(reduce){st.angle=goal.angle;st.ratio=goal.ratio;render();} else kick(); }
  cv.addEventListener('pointermove',move); cv.addEventListener('pointerdown',move);
  cv.addEventListener('pointerleave',function(){ idle=true; t0=performance.now()-Math.asin(Math.max(-1,Math.min(1,(st.angle-30)/9)))/0.45*1000; if(!reduce) kick(); else { goal.angle=30; goal.ratio=0.67; st.angle=30; st.ratio=0.67; render(); } });
  window.addEventListener('resize',render);
  render(); if(!reduce) kick();
})();
