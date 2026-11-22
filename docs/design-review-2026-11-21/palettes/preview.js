const paletteQuery = new URLSearchParams(location.search).get('palette')
document.documentElement.dataset.palette = ['chalk','stone','linen','sage','olive','clay','plum'].includes(paletteQuery) ? paletteQuery : 'chalk'
