// Conteo — mobiele navigatie
(function () {
  const toggle = document.querySelector('.mobile-toggle');
  const menu = document.querySelector('#header ul');
  if (!toggle || !menu) return;

  const icon = toggle.querySelector('ion-icon');

  function setOpen(open) {
    menu.classList.toggle('open', open);
    if (icon) icon.setAttribute('name', open ? 'close-outline' : 'menu-outline');
  }

  toggle.addEventListener('click', () => {
    setOpen(!menu.classList.contains('open'));
  });

  // Sluit het menu nadat op een link is geklikt (mobiel)
  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });
})();
