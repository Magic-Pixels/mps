
document.addEventListener('DOMContentLoaded', function () {

    /* Show - Hide Filters */

    const filterBar = document.getElementById('filterBar');
    const filterLabels = document.getElementsByClassName('filter-label');
    // const categoriesBar = document.getElementById('categoriesBar');
    const showFilters = document.getElementById('showFilters');
    const hideFilters = document.getElementById('hideFilters');
    const applyFilters = document.getElementById('applyFilters');
    // const showCategories = document.getElementById('showCategories');
    // const hideCategories = document.getElementById('hideCategories');
    const offcanvas = document.getElementsByClassName('offcanvas-md');

    function showSlideMenu(menu) {
        menu.classList.add('show');
        document.body.insertAdjacentHTML('beforeend', '<div class="offcanvas-backdrop fade show d-md-none" id="offcanvas"></div>');
        const offcanvas = document.getElementById('offcanvas');
        offcanvas.addEventListener('click', () => hideSlideMenu(menu));
    }

    function hideSlideMenu(menu) {
        menu.classList.remove('show');
        for (let filterLabel of filterLabels)
            filterLabel.classList.remove('open');
        document.getElementById('offcanvas').remove();
    }

    for (let menu of offcanvas) {
        menu.addEventListener('', (e) => {
            if (e.target === menu) {
                hideSlideMenu(menu);
            }
        });
    }

    showFilters.addEventListener('click', () => showSlideMenu(filterBar));
    hideFilters.addEventListener('click', () => hideSlideMenu(filterBar));
    applyFilters.addEventListener('click', () => hideSlideMenu(filterBar));
    // showCategories.addEventListener('click', () => showSlideMenu(categoriesBar));
    // hideCategories.addEventListener('click', () => hideSlideMenu(categoriesBar));

});
