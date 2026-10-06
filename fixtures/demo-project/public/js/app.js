window.addEventListener("load", function () {
  var saludo = document.querySelector(".saludo");

  if (saludo !== null) {
    saludo.dataset.cargado = "si";
  }
});
