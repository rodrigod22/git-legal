// Git Dojo — complemento da tela de login (Etapa 1H). O formulário funciona sem este arquivo; aqui só:
//  - o caminho de ?volta= vai para o campo oculto, para o login.php voltar à página pedida (ele mesmo
//    recusa qualquer coisa que não seja um caminho deste site);
//  - ?erro=1 e ?saiu=1 mostram o aviso e o escrevem depois do carregamento, para o leitor de tela anunciar.
(function () {
  var params = new URLSearchParams(window.location.search);
  var volta = params.get("volta");
  if (volta && volta.charAt(0) === "/" && volta.charAt(1) !== "/" && volta.charAt(1) !== "\\") {
    document.getElementById("volta").value = volta;
  }

  function anuncia(id) {
    var aviso = document.getElementById(id);
    var texto = aviso.textContent;
    aviso.textContent = "";
    aviso.classList.add("visivel");
    window.setTimeout(function () {
      aviso.textContent = texto;
    }, 100);
    return aviso;
  }

  if (params.get("erro") === "1") {
    anuncia("erro");
    ["usuario", "senha"].forEach(function (id) {
      var campo = document.getElementById(id);
      campo.setAttribute("aria-invalid", "true");
      campo.setAttribute("aria-describedby", "erro");
    });
  } else if (params.get("saiu") === "1") {
    anuncia("saiu");
  }
})();
