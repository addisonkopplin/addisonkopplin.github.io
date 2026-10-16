(function(){
  var q=function(id){return document.getElementById(id)}, data=window.NAIL_ORDER; if(!data) return;
  var total=data.order.length-1, reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var sp=q('sa-speed'), n=q('sa-n'), play=q('sa-play');
  function fmt(x){return x.toLocaleString('en-US')}
  var P=new StringArt.Player(q('sa'),data.nails,data.order,{
    speed:+sp.value,
    onTick:function(k){ q('sa-read').textContent='line '+fmt(k)+' / '+fmt(total)+(k>0?' · nail '+data.order[k]:''); },
    onDone:function(){ play.textContent='play'; play.setAttribute('aria-pressed','false'); }
  });
  function setPlaying(on){ if(on){P.target=+n.value; P.play();} else P.pause(); play.textContent=on?'pause':'play'; play.setAttribute('aria-pressed',on?'true':'false'); }
  sp.addEventListener('input',function(){P.speed=+sp.value; q('sa-speed-o').textContent=sp.value+' lines/frame';});
  n.addEventListener('input',function(){ q('sa-n-o').textContent=fmt(+n.value); setPlaying(false); P.target=+n.value; P.redrawTo(+n.value); });
  play.addEventListener('click',function(){ setPlaying(!P.playing); });
  q('sa-restart').addEventListener('click',function(){ P.pause(); P.redrawTo(0); n.value=total; q('sa-n-o').textContent=fmt(total); setPlaying(true); });
  var rt; window.addEventListener('resize',function(){clearTimeout(rt); rt=setTimeout(function(){P.resize();},150);});
  // Start: animate in when visible; under reduced motion show the finished image.
  if(reduce){ P.redrawTo(total); }
  else { P.redrawTo(0); setPlaying(true); }
})();
