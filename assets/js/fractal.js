/* Fractal tree renderer. Same construction as addisonkopplin/fractal_tree FractalTree.py:
   a trunk of length L, every branch splits into two at +/-phi, child length = parent * scale. */
window.FractalTree=(function(){
  function fitCanvas(cv){
    var dpr=Math.min(window.devicePixelRatio||1,2), r=cv.getBoundingClientRect();
    var w=Math.max(1,Math.round(r.width*dpr)), h=Math.max(1,Math.round(r.height*dpr));
    if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}
    return dpr;
  }
  // returns number of segments drawn
  function draw(cv,p){
    var dpr=fitCanvas(cv), ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
    ctx.clearRect(0,0,W,H);
    var depth=p.depth, phi=p.angle*Math.PI/180, s=p.ratio;
    // total height of a vertical chain: L*(1+s+s^2+...) ; size the trunk so the tree fits
    var geo=0,k; for(k=0;k<depth;k++) geo+=Math.pow(s,k);
    var L=Math.min(H*0.92/(geo||1), H*0.42)*(p.scale||1);
    var segs=0, x0=W/2, y0=H*0.98;
    var col=p.color||'#5cf2a4';
    ctx.lineCap='round';
    // iterative by level so we can style per level
    var level=[[x0,y0-L,Math.PI/2,L]];
    ctx.strokeStyle=col; ctx.globalAlpha=1; ctx.lineWidth=Math.max(1,2.2*dpr);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x0,y0-L); ctx.stroke(); segs=1;
    for(var i=1;i<depth;i++){
      var next=[], w=Math.max(.6*dpr,2.2*dpr*Math.pow(s,i)*1.2);
      ctx.lineWidth=w; ctx.globalAlpha=Math.max(.35,1-i*0.05);
      ctx.beginPath();
      for(var j=0;j<level.length;j++){
        var b=level[j], m=b[3]*s;
        for(var sgn=-1;sgn<=1;sgn+=2){
          var t=b[2]+sgn*phi, x1=b[0]+m*Math.cos(t), y1=b[1]-m*Math.sin(t);
          ctx.moveTo(b[0],b[1]); ctx.lineTo(x1,y1); next.push([x1,y1,t,m]); segs++;
        }
      }
      ctx.stroke(); level=next;
    }
    ctx.globalAlpha=1;
    return segs;
  }
  return {draw:draw};
})();
