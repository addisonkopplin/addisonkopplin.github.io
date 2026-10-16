/* String-art player: replays a precomputed nail order on a canvas.
   Nails are evenly spaced on a circle, numbered counter-clockwise from 3 o'clock
   (same convention as string_art_hq.py). */
window.StringArt=(function(){
  function Player(cv,nails,order,opts){
    this.cv=cv; this.n=nails; this.order=order; this.opts=opts||{};
    this.k=0; this.target=order.length-1; this.speed=this.opts.speed||20; this.playing=false;
    this.onTick=this.opts.onTick||function(){};
    this.resize();
  }
  Player.prototype.resize=function(){
    var dpr=Math.min(window.devicePixelRatio||1,2), r=this.cv.getBoundingClientRect();
    var S=Math.max(1,Math.round(r.width*dpr)); this.cv.width=S; this.cv.height=S; this.S=S;
    var c=(S-1)/2, rad=S/2-Math.max(3,S*0.012);
    this.X=new Float32Array(this.n); this.Y=new Float32Array(this.n);
    for(var i=0;i<this.n;i++){var t=2*Math.PI*i/this.n; this.X[i]=c+rad*Math.cos(t); this.Y[i]=c-rad*Math.sin(t);}
    this.redrawTo(this.k);
  };
  Player.prototype.clear=function(){
    var ctx=this.cv.getContext('2d'), S=this.S;
    ctx.fillStyle=this.opts.paper||'#f4f2ec'; ctx.fillRect(0,0,S,S);
    ctx.fillStyle='rgba(0,0,0,.55)';
    var nr=Math.max(.8,S/900);
    for(var i=0;i<this.n;i++){ctx.beginPath();ctx.arc(this.X[i],this.Y[i],nr,0,7);ctx.fill();}
  };
  Player.prototype.stroke=function(a,b){
    var ctx=this.cv.getContext('2d');
    ctx.beginPath();
    for(var i=a;i<b;i++){var p=this.order[i],q=this.order[i+1]; ctx.moveTo(this.X[p],this.Y[p]); ctx.lineTo(this.X[q],this.Y[q]);}
    ctx.stroke();
  };
  Player.prototype.style=function(){
    var ctx=this.cv.getContext('2d');
    ctx.strokeStyle='#000'; ctx.globalAlpha=this.opts.alpha||0.4; ctx.lineWidth=Math.max(.35,this.S/3800);
  };
  Player.prototype.redrawTo=function(k){
    this.clear(); this.style(); k=Math.max(0,Math.min(k,this.order.length-1));
    // draw in chunks so alpha accumulates per line like real thread
    for(var i=0;i<k;i+=1){ this.stroke(i,i+1); }
    this.getCtx().globalAlpha=1; this.k=k; this.onTick(k);
  };
  Player.prototype.getCtx=function(){return this.cv.getContext('2d');};
  Player.prototype.step=function(){
    if(!this.playing) return;
    var end=Math.min(this.target,this.k+this.speed);
    this.style(); for(var i=this.k;i<end;i++) this.stroke(i,i+1); this.getCtx().globalAlpha=1;
    // highlight current thread end
    this.k=end; this.onTick(end);
    if(this.k>=this.target){this.playing=false; if(this.opts.onDone) this.opts.onDone(); return;}
    var self=this; this.raf=requestAnimationFrame(function(){self.step();});
  };
  Player.prototype.play=function(){ if(this.k>=this.target) this.redrawTo(0); this.playing=true; var s=this; cancelAnimationFrame(this.raf); this.raf=requestAnimationFrame(function(){s.step();}); };
  Player.prototype.pause=function(){ this.playing=false; cancelAnimationFrame(this.raf); };
  return {Player:Player};
})();
