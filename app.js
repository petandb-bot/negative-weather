(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const ui={
    shoot:$('shootBtn'),mutate:$('mutateBtn'),play:$('playBtn'),save:$('saveBtn'),
    camera:$('cameraInput'),library:$('libraryInput'),libraryBtn:$('libraryBtn'),
    empty:$('emptyState'),busy:$('busy'),busyText:$('busyText'),
    condition:$('conditionLabel'),detail:$('detailLabel'),duration:$('durationLabel'),
    stage:$('stageLabel'),
    dot:$('statusDot'),progress:$('progressBar'),help:$('helpText'),
    playIcon:$('playIcon'),playText:$('playText'),
    modal:$('saveModal'),modalShade:$('modalShade'),modalClose:$('closeModal'),
    wav:$('saveWavBtn'),png:$('savePngBtn')
  };
  const renderer=new window.NWVisual($('art'));
  let features=null, world=null, photo=null, mutation=0, audioCtx=null, source=null, startedAt=0;
  let generating=false, playRequest=0, cachedAudioBuffer=null;
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const formatTime=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
    function status(label,playing=false){ ui.stage.textContent=label; ui.dot.classList.toggle('on',playing); }
  function showError(message){ ui.help.textContent=message; ui.help.hidden=false; }
  function clearError(){ ui.help.textContent=''; ui.help.hidden=true; }
  function busy(on,label='READING LIGHT'){
    generating=on; ui.busy.hidden=!on; ui.busyText.textContent=label;
    ui.shoot.disabled=on; ui.libraryBtn.disabled=on;
    ui.mutate.disabled=on||!features; ui.play.disabled=on||!world; ui.save.disabled=on||!world;
  }
  function stop(){
    ++playRequest; // 古いAudioContext.resume()が後から完了しても再生させない。
    if(source){ try{source.stop();}catch(e){} try{source.disconnect();}catch(e){} source=null; }
    renderer.playing=false; ui.playIcon.textContent='▷'; ui.playText.textContent='PLAY';
    ui.progress.style.width='0%'; status(world?'READY':'NO PHOTO');
  }
  async function play(){
    if(!world||generating) return;
    if(source){ stop(); return; }
    const request=++playRequest;
    try{
      if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      await audioCtx.resume();
      if(request!==playRequest||generating||!world) return;
      if(!cachedAudioBuffer) cachedAudioBuffer=window.NWAudio.makeBuffer(audioCtx,world);
      const node=audioCtx.createBufferSource(); node.buffer=cachedAudioBuffer;
      node.loop=true; node.connect(audioCtx.destination); node.start();
      source=node; startedAt=audioCtx.currentTime; renderer.playing=true;
      ui.playIcon.textContent='Ⅱ'; ui.playText.textContent='STOP'; status('PLAYING',true); clearError();
      node.onended=()=>{ if(source===node) stop(); };
    }catch(err){ if(request===playRequest){stop(); showError('AUDIO COULD NOT START');} console.error(err); }
  }
  async function openImage(file){
    if(generating) return;
    if(!file||!file.type.startsWith('image/')){ showError('PLEASE SELECT AN IMAGE FILE'); return; }
    stop(); busy(true,'READING IMAGE'); clearError(); await nextFrame();
    let imageUrl=null;
    try{
      imageUrl=URL.createObjectURL(file);
      const image=new Image(); image.decoding='async'; image.src=imageUrl;
      // decode()が利用できないブラウザでも動くようにする。
      if(image.decode) await image.decode();
      else await new Promise((resolve,reject)=>{ image.onload=resolve; image.onerror=reject; });
      if(!image.naturalWidth||!image.naturalHeight) throw new Error('Invalid image dimensions');
      const maxSide=1600, scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      const c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(image.naturalWidth*scale));
      c.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const g=c.getContext('2d',{alpha:false});
      if(!g) throw new Error('Canvas unavailable');
      g.drawImage(image,0,0,c.width,c.height);
      const nextFeatures=window.NWAudio.analyzeImage(c);
      // 画像のデコード・解析が成功してから現行写真を差し替える。
      photo=c; features=nextFeatures; mutation=0;
      ui.empty.hidden=true;
      renderer.setMood(0,features.hash,features,100,0);
      renderer.setPhoto(c);
      await generate();
    }catch(err){console.error(err);showError('IMAGE COULD NOT BE OPENED. TRY A JPEG OR PNG.');}
    finally { if(imageUrl) URL.revokeObjectURL(imageUrl); busy(false); }
  }
  async function generate(){
    if(!features || !photo) return;
    stop(); busy(true,'COMPOSING SOUND'); await nextFrame();
    try{
      const engine=window.NWAudio.chooseEngine(features,mutation);
      const seed=(features.hash^Math.imul(mutation+1,0x9e3779b9))>>>0;
      const result=window.NWAudio.synthesize(features,engine,seed);
      if(!result||!result.left||!result.right) throw new Error('Invalid audio buffer');
      world=result;
      cachedAudioBuffer=null; // 次に再生するとき新しい1つのAudioBufferを作る。
      renderer.setMood(engine,seed,features,result.bpm,mutation,result.duration);
      renderer.setComposition(result.composition);
      renderer.playing=false;
      ui.condition.textContent=`${result.name} / ${result.variant}`;
      ui.detail.textContent=`${result.bpm} BPM`;
      ui.duration.textContent=`LOOP ${formatTime(result.duration)}`;
      ui.progress.style.width='0%'; status('READY'); clearError();
    }catch(err){ console.error(err); showError('SOUND GENERATION FAILED'); world=null; cachedAudioBuffer=null; status('NO AUDIO'); }
    finally { busy(false); }
  }
  function syncProgress(){
    if(source&&audioCtx&&world){
      const elapsed=(audioCtx.currentTime-startedAt)%world.duration; const phase=elapsed/world.duration; ui.progress.style.width=`${(phase*100).toFixed(2)}%`;
      const idx=Math.min(world.envelope.length-1,Math.floor(phase*world.envelope.length));
      const comp=world.composition;
      const ci=comp?Math.min(comp.timeline.length-1,Math.floor(phase*comp.timeline.length)):0;
      renderer.setAudioState({phase,env:world.envelope[idx]||0,low:world.low[idx]||0,mid:world.mid[idx]||0,high:world.high[idx]||0,hit:world.hit[idx]||0,
        arrangement:comp?comp.timeline[ci]:.5,turn:comp?comp.transition[ci]:0,
        silence:comp?comp.silence:.25});
    }else{ renderer.setAudioState({phase:0,env:(renderer.audio?.env||0)*.92,low:0,mid:0,high:0,hit:0,arrangement:world?.composition?.timeline?.[0]??.5,turn:0,silence:world?.composition?.silence??.25}); }
    requestAnimationFrame(syncProgress);
  }
  function filename(ext){ return `negative-weather-${world?world.name.toLowerCase():'image'}-${String(world?.seed%10000||0).padStart(4,'0')}.${ext}`; }
  async function deliver(blob,name){
    try{
      const f=new File([blob],name,{type:blob.type||'application/octet-stream'});
      if(navigator.canShare?.({files:[f]})&&navigator.share){ await navigator.share({files:[f],title:'NEGATIVE WEATHER'}); return; }
    }catch(err){ if(err?.name==='AbortError') return; console.warn(err); }
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function showModal(on){ ui.modal.hidden=!on; }

  ui.shoot.addEventListener('click',()=>ui.camera.click());
  ui.libraryBtn.addEventListener('click',()=>ui.library.click());
  [ui.camera,ui.library].forEach(input=>input.addEventListener('change',()=>{ const file=input.files?.[0]; if(file) openImage(file); input.value=''; }));
  ui.mutate.addEventListener('click',async()=>{ if(!features||generating) return; mutation++; await generate(); });
  ui.play.addEventListener('click',play);
  ui.save.addEventListener('click',()=>{ if(world) showModal(true); });
  ui.modalShade.addEventListener('click',()=>showModal(false));
  ui.modalClose.addEventListener('click',()=>showModal(false));
  ui.wav.addEventListener('click',async()=>{ if(!world) return; showModal(false); try{await deliver(window.NWAudio.encodeWav(world),filename('wav'));}catch(err){console.error(err);showError('WAV EXPORT FAILED');} });
  ui.png.addEventListener('click',async()=>{ if(!photo) return; showModal(false); try{ await deliver(await renderer.pngBlob(),filename('png')); }catch(err){ console.error(err); showError('IMAGE EXPORT FAILED'); } });
  document.addEventListener('visibilitychange',()=>{ if(document.hidden&&source) stop(); });
  window.addEventListener('pagehide',()=>{ if(source) stop(); });
  requestAnimationFrame(syncProgress);
  if('serviceWorker' in navigator && location.protocol==='https:'){ navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline cache unavailable',e)); }
  window.__NW_TEST__={get world(){return world;},get features(){return features;},get mutation(){return mutation;},renderer};
})();
