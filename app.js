/*
 * NEGATIVE WEATHER — interface and workflow
 * 撮影/画像選択→特徴抽出→4つの音響エンジンのいずれかを生成→再生/書き出し。
 * 音声・写真は端末内だけで処理し、ネットワークにはアップロードしない。
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const ui={
    shoot:$('shootBtn'),mutate:$('mutateBtn'),play:$('playBtn'),save:$('saveBtn'),
    camera:$('cameraInput'),library:$('libraryInput'),libraryBtn:$('libraryBtn'),
    empty:$('emptyState'),busy:$('busy'),busyText:$('busyText'),
    condition:$('conditionLabel'),detail:$('detailLabel'),duration:$('durationLabel'),
    engine:$('engineLabel'),photo:$('photoLabel'),seed:$('seedLabel'),stage:$('stageLabel'),
    dot:$('statusDot'),progress:$('progressBar'),help:$('helpText'),
    playIcon:$('playIcon'),playText:$('playText'),
    modal:$('saveModal'),modalShade:$('modalShade'),modalClose:$('closeModal'),
    wav:$('saveWavBtn'),png:$('savePngBtn')
  };
  const renderer=new window.NWVisual($('art'));
  let features=null, world=null, photo=null, mutation=0, audioCtx=null, source=null, startedAt=0;
  let currentBlobUrl=null, generating=false;
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const formatTime=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
  function status(label,playing=false){
    ui.stage.textContent=label;
    ui.dot.classList.toggle('on',playing);
  }
  function busy(on,label='READING LIGHT'){
    generating=on;ui.busy.hidden=!on;ui.busyText.textContent=label;
    ui.shoot.disabled=on;ui.mutate.disabled=on||!features;ui.play.disabled=on||!world;ui.save.disabled=on||!world;
  }
  function stop(){
    if(source){try{source.stop();}catch(e){}try{source.disconnect();}catch(e){}source=null;}
    renderer.playing=false;
    ui.playIcon.textContent='▷';ui.playText.textContent='PLAY';
    status(world?'READY':'STANDBY');
  }
  async function play(){
    if(!world||generating)return;
    if(source){stop();return;}
    try{
      // iOS SafariではPLAYの直接操作からAudioContextを起動する。
      if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      await audioCtx.resume();
      const node=audioCtx.createBufferSource();
      node.buffer=window.NWAudio.makeBuffer(audioCtx,world);
      node.loop=true;
      node.connect(audioCtx.destination);
      node.start();source=node;startedAt=audioCtx.currentTime;
      renderer.playing=true;
      ui.playIcon.textContent='Ⅱ';ui.playText.textContent='STOP';status('TRANSMITTING',true);
      node.onended=()=>{if(source===node)stop();};
    }catch(err){stop();showError('AUDIO COULD NOT START');console.error(err);}
  }
  function showError(message){ui.help.textContent=message;}
  async function openImage(file){
    if(!file||!file.type.startsWith('image/')){showError('PLEASE SELECT AN IMAGE FILE');return;}
    stop();busy(true,'READING LIGHT');
    await nextFrame();
    try{
      // 元写真は圧縮せず端末内で読み、GPUには最大1600pxに縮小して送る。
      if(currentBlobUrl){URL.revokeObjectURL(currentBlobUrl);currentBlobUrl=null;}
      currentBlobUrl=URL.createObjectURL(file);
      const image=new Image();image.decoding='async';image.src=currentBlobUrl;
      if(image.decode)await image.decode();
      else await new Promise((res,rej)=>{image.onload=res;image.onerror=rej;});
      const maxSide=1600, scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
      const c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(image.naturalWidth*scale));
      c.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const g=c.getContext('2d',{alpha:false});
      g.drawImage(image,0,0,c.width,c.height);
      photo=c;features=window.NWAudio.analyzeImage(c);mutation=0;
      renderer.setPhoto(c);ui.empty.hidden=true;
      ui.photo.textContent='CAPTURED LIGHT';
      await generate();
    }catch(err){
      console.error(err);showError('IMAGE COULD NOT BE OPENED. TRY A JPEG OR PNG.');
    }finally {busy(false);}
  }
  async function generate(){
    if(!features||generating&&!photo)return;
    stop();busy(true,'COMPOSING WEATHER');await nextFrame();
    try{
      // キャプチャ画像のハッシュと世代番号を混合。異なるHATCHは必ず異なるシード。
      const engine=window.NWAudio.chooseEngine(features,mutation);
      const seed=(features.hash^Math.imul(mutation+1,0x9e3779b9))>>>0;
      const result=window.NWAudio.synthesize(features,engine,seed);
      if(result.left.length!==result.right.length||!result.left.every(Number.isFinite))throw Error('Invalid audio');
      world=result;renderer.setMood(engine,seed,features,result.bpm);renderer.playing=false;
      ui.condition.textContent=result.name;
      ui.engine.textContent=`${String(engine+1).padStart(2,'0')} / 04`;
      // これは写真の動きを推定した「生成BPM」であり、実際の被写体の速度推定ではない。
      const character=features.texture>.40?'DENSE':features.openness>.74?'OPEN':features.light<.28?'DARK':'MIXED';
      ui.detail.textContent=`${result.bpm} BPM · ${character}`;
      ui.duration.textContent=formatTime(result.duration);
      ui.seed.textContent=`FRAME: ${String(seed%10000).padStart(4,'0')}`;
      ui.help.textContent='Your image shapes the sound. MUTATE explores its possible weather.';
      ui.progress.style.width='0%';status('READY');
    }catch(err){console.error(err);showError('SOUND GENERATION FAILED');world=null;}
    finally {busy(false);}
  }
  function syncProgress(){
    if(source&&audioCtx&&world){
      const elapsed=(audioCtx.currentTime-startedAt)%world.duration;
      const phase=elapsed/world.duration;
      ui.progress.style.width=`${(phase*100).toFixed(2)}%`;
      const env=world.envelope;
      renderer.energy=env[Math.min(env.length-1,Math.floor(phase*env.length))]||0;
    }else{renderer.energy*=.92;}
    requestAnimationFrame(syncProgress);
  }
  function filename(ext){return `negative-weather-${world?world.name.toLowerCase():'image'}-${String(world?.seed%10000||0).padStart(4,'0')}.${ext}`;}
  async function deliver(blob,name){
    // iOSでは共有シートから「ファイルに保存」が使える場合がある。
    // canShareがないブラウザーは通常ダウンロードへフォールバック。
    try{
      const f=new File([blob],name,{type:blob.type});
      if(navigator.canShare?.({files:[f]})&&navigator.share){await navigator.share({files:[f],title:'NEGATIVE WEATHER'});return;}
    }catch(err){if(err?.name==='AbortError')return;console.warn(err);}
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function showModal(on){ui.modal.hidden=!on;}

  ui.shoot.addEventListener('click',()=>ui.camera.click());
  ui.libraryBtn.addEventListener('click',()=>ui.library.click());
  [ui.camera,ui.library].forEach(input=>input.addEventListener('change',()=>{
    const file=input.files?.[0];if(file)openImage(file);input.value='';
  }));
  ui.mutate.addEventListener('click',async()=>{if(!features||generating)return;mutation++;await generate();});
  ui.play.addEventListener('click',play);
  ui.save.addEventListener('click',()=>{if(world)showModal(true);});
  ui.modalShade.addEventListener('click',()=>showModal(false));
  ui.modalClose.addEventListener('click',()=>showModal(false));
  ui.wav.addEventListener('click',async()=>{if(!world)return;showModal(false);await deliver(window.NWAudio.encodeWav(world),filename('wav'));});
  ui.png.addEventListener('click',async()=>{if(!photo)return;showModal(false);try{await deliver(await renderer.pngBlob(),filename('png'));}catch(err){console.error(err);showError('IMAGE EXPORT FAILED');}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&source)stop();});
  window.addEventListener('pagehide',()=>{if(source)stop();});
  requestAnimationFrame(syncProgress);
  if('serviceWorker' in navigator&&location.protocol==='https:'){
    navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline cache unavailable',e));
  }
  // テスト用に状態の最小限の参照を提供。通常UIからは利用しない。
  window.__NW_TEST__={get world(){return world;},get features(){return features;},get mutation(){return mutation;},renderer};
})();
