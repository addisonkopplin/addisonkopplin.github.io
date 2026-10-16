/* Shared: UTC clock in the top bar. */
(function(){
  var el=document.querySelector('[data-clock]'); if(!el) return;
  function pad(n){return String(n).padStart(2,'0')}
  function tick(){var d=new Date();el.textContent='UTC '+d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+':'+pad(d.getUTCSeconds());}
  tick(); setInterval(tick,1000);
})();
