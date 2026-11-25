(function () {
  const nomes = {
    "1111": "Banco Exemplo A",
    "2222": "Banco Exemplo B",
    "3333": "Banco Exemplo B",
    "4444": "Banco Exemplo C",
    "5555": "Banco Exemplo D",
    "6666": "Banco Exemplo E"
  };

  function final(value) {
    return String(value || "").replace(/\D/g, "").slice(-4);
  }

  function label(value) {
    const digits = final(value);
    if (!digits) return "";
    return nomes[digits] ? `${nomes[digits]} — final ${digits}` : `Final ${digits}`;
  }

  window.Cartoes = { label };
})();
