// Builds the cards of a "reasons" video from window.CARDS before shared.js starts the clock.
// A card: { lines: [...], emoji: ['😉', '👌'], dur: 3.4 } — the first emoji bobs, the second waves.
// Latin words inside a line (CHAOS, Among Us…) are kept left-to-right.
(function () {
  const stage = document.getElementById('stage');
  const flash = document.getElementById('flash');
  const lat = s => s.replace(/([A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9]|[A-Za-z])/g, '<span class="lat">$1</span>');
  let t = 0;
  CARDS.forEach(c => {
    const sc = document.createElement('section');
    sc.className = 'scene rcard';
    sc.dataset.start = t.toFixed(2);
    sc.dataset.end = (t + c.dur).toFixed(2);
    sc.dataset.noflash = '';
    const lines = c.lines.map((l, i) => `<div class="ln pop" data-at="${(0.05 + i * 0.3).toFixed(2)}">${lat(l)}</div>`).join('');
    const at = (0.2 + c.lines.length * 0.3).toFixed(2);
    const emo = c.emoji.map((e, i) => `<span class="e ${i ? 'b' : ''}"><span class="${i ? 'wav' : 'wob'}" style="display:inline-block">${e}</span></span>`).join('');
    sc.innerHTML = `<div class="txt">${lines}</div><div class="emo pop" data-at="${at}">${emo}</div>`;
    stage.insertBefore(sc, flash);
    t += c.dur;
  });
  document.body.dataset.duration = t.toFixed(2);
})();
