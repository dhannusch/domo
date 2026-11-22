const paletteDefinitions = [
 {id:'chalk',name:'Chalk',description:'Clean gray and white. Charcoal controls.',tradeoff:'The clearest and most neutral; a little more austere.',paper:'#f5f5f5',accent:'#505050',ink:'#292929',darkPaper:'#1c1c1c',darkInk:'#ebebeb',darkAccent:'#d0d0d0'},
 {id:'stone',name:'Stone',description:'Soft mineral gray. Slightly warmer ink.',tradeoff:'Balanced and understated; less bright than Chalk.',paper:'#eeede9',accent:'#5b5852',ink:'#302f2c',darkPaper:'#22211f',darkInk:'#e9e7df',darkAccent:'#d0cbc0'},
 {id:'linen',name:'Linen',description:'Warm off-white. Taupe and brown charcoal.',tradeoff:'The warmest and most paper-like; a subtle cream cast.',paper:'#f5f1e9',accent:'#61594d',ink:'#302d28',darkPaper:'#23211e',darkInk:'#eee8de',darkAccent:'#d4c8b6'}
]
const controls=Object.fromEntries(['screen','theme','device','mode'].map(id=>[id,document.getElementById(id)]))
const query=new URLSearchParams(location.search)
for(const [name,c]of Object.entries(controls))if([...c.options].some(o=>o.value===query.get(name)))c.value=query.get(name)
const grid=document.getElementById('palettes')
function render(){const screen=controls.screen.value,theme=controls.theme.value,device=controls.device.value,mode=controls.mode.value
 grid.innerHTML=paletteDefinitions.map(p=>{const preview=`preview.html?palette=${p.id}&theme=${theme}&screen=${screen}`,capture=`captures/${p.id}-${device}-${theme}-${screen}.png`;return `<article class="palette"><h2>${p.name}</h2><p class="description">${p.description}</p><div class="swatches" aria-label="${p.name} ${theme} paper, ink, accent">${(theme==='dark'?[p.darkPaper,p.darkInk,p.darkAccent]:[p.paper,p.ink,p.accent]).map(color=>`<span class="swatch" style="background:${color}" title="${color}"></span>`).join('')}<span>Paper · Ink · Accent</span></div><div class="preview ${device}">${mode==='captures'?`<img src="${capture}" alt="Soft Focus, ${p.name}, ${device}, ${theme}, ${screen}" role="button" tabindex="0" data-testid="palette-capture-${p.id}">`:`<iframe src="${preview}" title="${p.name} prototype" width="${device==='phone'?375:1440}" height="${device==='phone'?812:1000}" data-testid="palette-preview-${p.id}"></iframe>`}</div><p class="capture-label">${mode==='captures'?'Rendered screenshot · click to enlarge':'Local interactive prototype'}</p><p class="tradeoff">${p.tradeoff}</p><a href="${preview}" data-testid="palette-open-${p.id}">Open ${p.name}</a></article>`}).join('')
 const url=new URL(location);for(const[name,c]of Object.entries(controls))url.searchParams.set(name,c.value);history.replaceState(null,'',url);resize()
}
function resize(){grid.querySelectorAll('iframe').forEach(f=>{const scale=f.parentElement.clientWidth/Number(f.width);f.style.transform=`scale(${scale})`;f.parentElement.style.height=`${Number(f.height)*scale}px`})}
Object.values(controls).forEach(c=>c.addEventListener('change',render));window.addEventListener('resize',resize)
const dialog=document.getElementById('zoom')
function zoom(img){document.getElementById('zoom-title').textContent=img.alt;document.getElementById('zoom-image').src=img.src;document.getElementById('zoom-image').alt=img.alt;dialog.showModal()}
grid.addEventListener('click',e=>{if(e.target.tagName==='IMG')zoom(e.target)})
grid.addEventListener('keydown',e=>{if(e.target.tagName==='IMG'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();zoom(e.target)}})
document.getElementById('zoom-close').addEventListener('click',()=>dialog.close());render()
