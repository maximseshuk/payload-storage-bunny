function insertBunnyTocBanner() {
  const host = document.getElementById('table-of-contents-content')?.parentElement.parentElement
  if (!host || host.querySelector('.sb-bunny-card')) return
  host.insertAdjacentHTML(
    'afterbegin',
    '<a class="sb-bunny-card" href="https://bunny.net?ref=fndfoymy0j" target="_blank" rel="noopener"><img class="sb-bunny-card-light" src="/images/bunny-square-light.jpg" alt="bunny.net: start a 14-day free trial" /><img class="sb-bunny-card-dark" src="/images/bunny-square-dark.jpg" alt="bunny.net: start a 14-day free trial" /></a>',
  )
}

new MutationObserver(insertBunnyTocBanner).observe(document.documentElement, { childList: true, subtree: true })
insertBunnyTocBanner()
