(function(){
  var cv=document.getElementById('ft'), q=function(id){return document.getElementById(id)};
  var d=q('ft-depth'), a=q('ft-angle'), r=q('ft-ratio');
  function go(){
    q('ft-depth-o').textContent=d.value; q('ft-angle-o').textContent=(+a.value).toFixed(1).replace(/\.0$/,'')+'°'; q('ft-ratio-o').textContent=(+r.value).toFixed(2);
    var n=FractalTree.draw(cv,{depth:+d.value,angle:+a.value,ratio:+r.value}); q('ft-read').textContent=n.toLocaleString('en-US')+' segments';
  }
  [d,a,r].forEach(function(el){el.addEventListener('input',go)});
  q('ft-reset').addEventListener('click',function(){d.value=10;a.value=30;r.value=0.67;go();});
  window.addEventListener('resize',go); go();
})();
