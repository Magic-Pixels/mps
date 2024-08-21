document.addEventListener("DOMContentLoaded", function () {
  const navbar = document.getElementById("navbarCollapse");
  const toggler = document.getElementById("navbar-toggler");
  const topLinks = document.getElementsByClassName("unlink");

  toggler.addEventListener("click", function () {
    /* Toggle the navbar visibility */
    toggler.classList.toggle("collapse");
    navbar.classList.toggle("collapse");
    navbar.classList.toggle("show");
    /* Update the aria-expanded attribute */
    const expanded = navbar.classList.contains("show");
    toggler.setAttribute("aria-expanded", expanded);
  });

  for(let topLink of topLinks) {
    topLink.addEventListener("click", function (e) {
      if (window.innerWidth <= 767) {
        e.preventDefault();
        topLink.classList.toggle("show");
        if (topLink.classList.contains("show"))
          for (let otherLink of topLinks)
            if (otherLink !== topLink)
              otherLink.classList.remove("show");
      }
    });
  }
});
