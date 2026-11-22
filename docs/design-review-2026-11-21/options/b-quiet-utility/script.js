import {icons,button,chat,components,settings,file,states} from './templates.js';
const params=new URLSearchParams(location.search);
const theme=params.get('theme');
document.documentElement.dataset.theme=theme==='dark'||theme==='light'?theme:matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
const screen=params.get('screen')||'chat';
const body=screen==='components'?components():screen==='states'?states():chat();
document.querySelector('#app').innerHTML=`<div class="frame"><header class="masthead"><div class="masthead-brand"><span class="wordmark">domo</span><span class="date">Saturday, November 21</span></div>${button(icons.gear,'settings-open','icon','aria-label="Settings"')}</header><main id="conversation">${body}<div id="sent-messages"></div></main></div>
<div class="compose-wrap"><div class="compose-inner"><div class="reply-context" hidden><span data-reply-text></span>${button('×','reply-cancel','icon','aria-label="Remove reply context"')}</div><div class="compose-confirm" role="status" hidden></div><div class="needs-list" hidden>${button('Where should we start?','needs-jump')}</div><div class="compose-status"><span class="caption">Enter to send</span>${button('1 needs you','needs-toggle','needs','aria-expanded="false"')}</div><form class="compose-form" id="compose">${button(icons.attach,'attach','icon','aria-label="Attach an image"')}<input type="file" accept="image/*" id="image-picker" hidden data-testid="image-picker"><textarea rows="1" placeholder="Message Domo…" aria-label="Message Domo" data-testid="composer-input"></textarea><button class="icon send" type="submit" aria-label="Send message" data-testid="composer-send">${icons.arrow}</button></form></div></div>${settings()}${file()}`;
const $=s=>document.querySelector(s);
const showReply=text=>{$('.reply-context').hidden=false;$('[data-reply-text]').textContent=text;$('[data-testid=composer-input]').focus();};
const notify=text=>{const el=$('.compose-confirm');el.textContent=text;el.hidden=false;};
const openDialog=id=>{const dialog=$('#'+id);dialog.showModal();};
if(screen==='settings'||screen==='file')openDialog(screen);
document.addEventListener('click',event=>{
 const el=event.target.closest('button[data-action]');if(!el)return;
 const action=el.dataset.action;
 if(action==='settings-open')openDialog('settings');
 if(action==='settings-done')$('#settings').close();
 if(action==='file-open')openDialog('file');
 if(action==='file-done')$('#file').close();
 if(action==='source-view'){$('#original').hidden=!$('#original').hidden;el.textContent=$('#original').hidden?'View':'Hide';el.setAttribute('aria-expanded',String(!$('#original').hidden));}
 if(action==='not-quite')showReply('Correcting “two quiet evenings”');
 if(action==='reply')showReply('Replying to “You have two quiet evenings.”');
 if(action==='reply-cancel')$('.reply-context').hidden=true;
 if(action==='other')showReply('Replying to “Where should we start?”');
 if(action==='choose'){
  el.closest('.choice-options').querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b===el));b.disabled=true;});
  const message=el.closest('.decision').querySelector('[data-choice-status]');message.textContent='Chose '+el.dataset.value+'.';
  $('[data-testid=needs-toggle]').textContent='All caught up';$('[data-testid=needs-toggle]').disabled=true;
 }
 if(action==='needs-toggle'){$('.needs-list').hidden=!$('.needs-list').hidden;el.setAttribute('aria-expanded',String(!$('.needs-list').hidden));}
 if(action==='needs-jump'){$('.needs-list').hidden=true;$('.decision')?.scrollIntoView({block:'center',behavior:'instant'});$('.decision')?.querySelector('button')?.focus({preventScroll:true});}
 if(action==='receipt-view'){const detail=el.closest('.receipt').querySelector('.receipt-detail');detail.hidden=!detail.hidden;el.textContent=detail.hidden?'View':'Hide';el.setAttribute('aria-expanded',String(!detail.hidden));}
 if(action==='attach')$('#image-picker').click();
 if(el.dataset.pick){
  el.closest('.picks').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));
  if(el.dataset.pick==='Appearance'){const val=el.textContent.toLowerCase();document.documentElement.dataset.theme=val==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):val;}
  $('#setting-status').textContent=el.dataset.pick+': '+el.textContent+' (preview only).';
 }
 if(action==='tidy-undo'){el.textContent='Tidy undone';el.disabled=true;}
 if(action==='pair-unlock'){notify('Pairing preview only. This does not connect a device.');}
 if(action==='proposal-save'||action==='proposal-keep'){$('[data-proposal-status]').textContent=action==='proposal-save'?'Saved in this preview.':'Your instructions are kept.';}
 if(action==='push-enable'||action==='push-later'){$('[data-push-status]').textContent=action==='push-enable'?'Preview only. No browser permission was requested.':'You can turn these on in Settings later.';}
 if(action==='instructions-save')$('#setting-status').textContent='Instructions saved in this preview.';
 if(action==='notification-test')$('#setting-status').textContent='Notification preview selected. No notification was sent.';
 if(action==='memory-archive'){el.closest('.memory').innerHTML='<p class="caption">Archived. Domo would stop using this note.</p>';}
 if(action==='lab-undo'){el.textContent='Undone';el.disabled=true;}
 if(action==='stop'){$('[data-work-label]').textContent='Stopped. Your work is kept.';el.disabled=true;el.textContent='Stopped';}
 if(action==='retry'){el.textContent='Ready to retry';notify('Your retained draft is ready. This preview does not call a model.');}
 if(action==='sample-reply-remove'){el.closest('.reply-demo').hidden=true;}
 if(action==='attachment-remove'){el.closest('.attachment-demo').hidden=true;}
 if(action.startsWith('mention-')){$('[data-testid=mention-draft]').value='@'+el.textContent+' ';el.closest('.mention-menu').hidden=true;}
});
document.querySelectorAll('dialog').forEach(dialog=>{dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});});
document.querySelector('[data-questions]')?.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.target);const parts=[data.get('time'),data.get('limits')].filter(Boolean);event.target.querySelector('[data-answer-status]').textContent=parts.length?'Answers sent.':'No answers added yet.';if(parts.length)event.target.querySelector('button').disabled=true;});
document.querySelectorAll('.check-list input').forEach(input=>input.addEventListener('change',()=>{const list=input.closest('.component');const all=list.querySelectorAll('input');list.querySelector('[data-check-count]').textContent=[...all].filter(i=>i.checked).length+' of '+all.length+' done';}));
$('#compose').addEventListener('submit',event=>{event.preventDefault();const input=$('[data-testid=composer-input]');const text=input.value.trim();if(!text)return;const article=document.createElement('article');article.className='added-message user-turn';const speaker=document.createElement('span');speaker.className='speaker';speaker.textContent='You';const content=document.createElement('p');content.textContent=text;article.append(speaker,content);$('#sent-messages').append(article);input.value='';$('.reply-context').hidden=true;notify('Message added to this preview. No model is connected.');});
$('[data-testid=composer-input]').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('#compose').requestSubmit();}});
$('#image-picker').addEventListener('change',event=>{if(event.target.files.length)notify('Image attached in this preview: '+event.target.files[0].name);});
