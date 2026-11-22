const options = [
 {dir:'a-correspondence',letter:'A',name:'Correspondence',rationale:'Open, editorial and reading-first. Asymmetric speakers and generous typography let the conversation carry the page.',tradeoff:'The calmest reading rhythm; more scrolling in long histories.'},
 {dir:'b-quiet-utility',letter:'B',name:'Quiet Utility',rationale:'Compact, precise and capable. Crisp shared controls make decisions and active work easy to scan.',tradeoff:'Efficient and predictable; less warmth and literary atmosphere.'},
 {dir:'c-soft-focus',letter:'C',name:'Soft Focus',rationale:'Comfortable in the hand. Rounded tactile controls, generous fields and a strong phone composition.',tradeoff:'Best phone comfort; larger interaction surfaces and a source sheet.'},
 {dir:'d-folio',letter:'D',name:'Folio',rationale:'A personal working document. Angular surfaces and careful provenance give decisions and finished work more presence.',tradeoff:'Strongest document emphasis; more formal, with a heavier decision frame.'}
]
const controls = Object.fromEntries(['screen','device','theme','mode'].map(id=>[id,document.getElementById(id)]))
const query = new URLSearchParams(location.search)
for(const [name,control] of Object.entries(controls)){if([...control.options].some(o=>o.value===query.get(name)))control.value=query.get(name)}
const grid = document.getElementById('directions')
function render(){
 const screen=controls.screen.value, device=controls.device.value, theme=controls.theme.value, mode=controls.mode.value
 grid.innerHTML=options.map(o=>{const href=`options/${o.dir}/?screen=${screen}&theme=${theme}`,capture=`captures/${o.dir}-${device}-${theme}-${screen}.png`;return `<article class="direction"><span class="letter">Direction ${o.letter}</span><h2>${o.name}</h2><p class="rationale">${o.rationale}</p><div class="preview ${device}" data-name="${o.name}">${mode==='screenshots'?`<img src="${capture}" alt="${o.name}: ${screen}, ${device}, ${theme}" data-testid="capture-${o.letter}" tabindex="0" role="button" aria-label="Enlarge ${o.name} screenshot">`:`<iframe src="${href}" title="${o.name} interactive ${screen}" width="${device==='phone'?375:1440}" height="${device==='phone'?812:1000}" data-testid="prototype-${o.letter}"></iframe>`}</div><p class="preview-note">${mode==='screenshots'?'Captured in Chrome. Click to enlarge.':'Local prototype. Scroll and try the controls.'}</p><div class="direction-actions"><a href="${href}" data-testid="open-${o.letter}">Open ${o.letter} prototype</a><a href="options/${o.dir}/rationale.md" data-testid="rationale-${o.letter}">Rationale</a></div><p class="tradeoff"><strong>Tradeoff:</strong> ${o.tradeoff}</p></article>`}).join('')
 const url=new URL(location);for(const [name,c]of Object.entries(controls))url.searchParams.set(name,c.value);history.replaceState(null,'',url)
 resize()
}
function resize(){grid.querySelectorAll('iframe').forEach(frame=>{const width=Number(frame.width);const scale=frame.parentElement.clientWidth/width;frame.style.transform=`scale(${scale})`;frame.parentElement.style.height=`${Number(frame.height)*scale}px`;frame.parentElement.style.maxHeight="none"})}
Object.values(controls).forEach(control=>control.addEventListener('change',render))
window.addEventListener('resize',resize)
const zoom=document.getElementById('zoom')
function openCapture(img){document.getElementById('zoom-label').textContent=img.alt;document.getElementById('zoom-image').src=img.src;document.getElementById('zoom-image').alt=img.alt;zoom.showModal()}
grid.addEventListener('click',event=>{if(event.target.tagName==='IMG')openCapture(event.target)})
grid.addEventListener('keydown',event=>{if(event.target.tagName==='IMG'&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openCapture(event.target)}})
document.getElementById('zoom-close').addEventListener('click',()=>zoom.close())
render()
