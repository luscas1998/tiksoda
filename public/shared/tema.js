// Aplica o tema escolhido no link do overlay (?tema=neon). Carregar no <head>.
(function () {
  var t = new URLSearchParams(location.search).get('tema');
  if (t) document.documentElement.setAttribute('data-tema', t);
})();
