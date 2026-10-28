(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const unit=x=>clamp(Number.isFinite(+x)?+x:0,0,1);
  function random01(seed){
    let x=(seed>>>0)||0x62f5a31b;
    x^=x<<13; x^=x>>>17; x^=x<<5;
    return (x>>>0)/4294967296;
  }
  function weightedPick(weights,seed){
    const sum=weights.reduce((a,b)=>a+Math.max(0,b),0);
    if(!(sum>0))return 0;
    let x=random01(seed)*sum;
    for(let i=0;i<weights.length;i++){
      x-=Math.max(0,weights[i]);
      if(x<0)return i;
    }
    return weights.length-1;
  }
  // 写真の特徴は一度抽出し、MUTATEでは乱数だけを変える。
  // 8モードを必ず巡回させる仕組みは採用せず、写真ごとの偏りを維持する。
  function visualWeights(f){
    const light=unit(f.light),dark=1-light,edge=unit(f.edge);
    // エッジ解析値は実写では小さく出やすい。単純な開放度を使うと
    // どの写真も LENS FLOAT に偏るため、視覚用に正規化した細部量を使う。
    const tex=unit(f.texture*1.9),detail=unit(f.edge*3.5+f.texture*.22);
    const open=unit(1-detail*.85-tex*.16),contr=unit(f.contrast*2.8);
    const spatial=unit(f.spatialContrast*2.2),sat=unit(f.saturation);
    const hueMix=unit(f.colorDiversity),hi=unit(f.highlights*3.0);
    const axis=unit(f.orientation)*detail,balance=unit(Math.abs(f.balance));
    const raw=[
      .12+2.8*open+1.5*(1-detail)+.9*hi+.6*light,                    // LENS FLOAT
      .12+3.0*spatial+1.5*balance+1.1*tex+.4*detail,               // TIDAL SHEAR
      .12+2.5*hi+1.4*contr+1.3*open+.8*hueMix,                  // IRIS
      .12+3.0*detail+2.0*axis+1.5*tex+.5*contr,                  // GLITCH BLOOM
      .12+2.5*sat+1.8*hueMix+1.0*tex+.7*unit(f.warm),           // SOLVENT
      .12+2.7*dark+1.4*(1-sat)+1.1*spatial+.6*open,         // GHOST FIELD
      .12+2.6*hueMix+2.1*sat+1.0*light+.5*unit(f.cool),         // CHROMA MORPH
      .12+2.4*contr+1.7*detail+1.7*tex+.7*dark                    // COLLAPSE/RETURN
    ];
    return raw.map(v=>Math.pow(v,3.8));
  }
  function colorWeights(f){
    const sat=unit(f.saturation),light=unit(f.light),div=unit(f.colorDiversity);
    const cool=unit(f.cool*3),warm=unit(f.warm*3),edge=unit(f.edge);
    return [
      .25+1.6*light+1.6*unit(f.openness), // fade
      .25+2.1*sat+1.5*unit(f.texture),   // melt
      .25+2.0*div+1.3*edge,             // split
      .25+2.3*light+1.5*(1-sat),        // bleach
      .25+2.1*cool+1.0*(1-light),       // phosphor
      .25+2.1*warm+1.1*sat             // heat shift
    ].map(v=>v*v*v);
  }
  class PhotoRenderer {
    constructor(canvas){
      this.canvas=canvas;
      this.ctx=canvas.getContext('2d',{willReadFrequently:true});
      this.image=null; this.basePhoto=null; this.sourcePixels=null; this.framePixels=null;
      this.energy=0; this.engine=0; this.seed=.5; this.t=0; this.playing=false; this.bpm=100;
      this.features={motion:.4,hue:0,saturation:0,warm:0,cool:0,palette:[[.45,.5,.5],[.2,.7,.8],[.8,.3,.5]]};
      this.audio={env:0,low:0,mid:0,high:0,hit:0,phase:0}; this.hasPhoto=false;
      this.lastDraw=0; this.eventPulse=0; this.prevHit=0; this.lastRenderError=null;
      this.recipe=0; this.frameCost=0; this.drawCount=0; this.motionHistory=[];
      this.duration=20; this.history=null; this.historyAt=-100; this.sceneIndex=0;
      this.colorProfile=0; this.motionProfile=0; this.colorLayers=[]; this.motionLayers=[]; this.cachedPatches=null;
      this.activity=1; this.visualFamily=0; this.motionMutation=0; this.renderErrors=0;
      this.signalDirection=0; this.signalDensity=0; this.baseBreath=0;
      this.resize(); window.addEventListener('resize',()=>this.resize(),{passive:true});
      requestAnimationFrame(t=>this.frame(t));
    }
    resize(){
      const box=this.canvas.getBoundingClientRect(); if(!box.width||!box.height) return;
      const scale=Math.min(window.devicePixelRatio||1,1.10,430/Math.max(box.width,box.height));
      this.canvas.width=Math.max(1,Math.round(box.width*scale)); this.canvas.height=Math.max(1,Math.round(box.height*scale));
      if(this.image) { this.prepare2D(); this.prepareColorLayers(); this.prepareMotionLayers(); }
      if(this.hasPhoto) this.safeRender();
    }
    setPhoto(image){
      this.image=image; this.hasPhoto=true; this.history=null;this.historyAt=-100;this.prepare2D();
      this.cachedPatches=this.makePatches(); this.prepareColorLayers(); this.prepareMotionLayers();
      // 写真の登録は描画エラーから独立させる。初期化前でも静止画を表示できる。
      this.safeRender();
    }
    prepare2D(){
      if(!this.ctx||!this.image) return;
      const w=this.canvas.width,h=this.canvas.height;
      const src=document.createElement('canvas'); src.width=w; src.height=h;
      const g=src.getContext('2d',{willReadFrequently:true});
      const scale=Math.max(w/this.image.width,h/this.image.height);
      g.drawImage(this.image,(w-this.image.width*scale)/2,(h-this.image.height*scale)/2,this.image.width*scale,this.image.height*scale);
      this.basePhoto=src; this.sourcePixels=g.getImageData(0,0,w,h).data; this.framePixels=this.ctx.createImageData(w,h);
    }
    setMood(index,seed,features={},bpm=100,mutation=0,duration=20){
      this.engine=index; this.seed=(seed%100000)/100000; this.duration=duration;
      this.features={hue:0,saturation:0,warm:0,cool:0,...features};
      // 写真ごとに強い選択傾向を持たせる。全8種を試せることは保証しない。
      // 同じ写真のMUTATEでは、同じ系統の深掘りや再出現も許容する。
      const hash=features.hash>>>0;
      const base=visualWeights(this.features);
      const weighted=base.slice();
      const rhythmic=[0,1,0,1,0,1,0,1,1,0,1,1][index]||0;
      // 音響との相性は補助的な影響だけにする（写真の個性を上書きしない）。
      const align=rhythmic?[1,3,7]:[0,2,4,5];
      for(const i of align) weighted[i]*=1.12;
      this.visualFamily=weightedPick(weighted,(hash ^ Math.imul(mutation+1,0x9e3779b9) ^ 0x83c62129)>>>0);
      this.recipe=this.visualFamily;
      this.colorProfile=weightedPick(colorWeights(this.features),(hash ^ Math.imul(mutation+1,0x85ebca6b) ^ 0x318cf264)>>>0);

      // 静・中・動も写真に依存。輪郭の少ない写真は静的な映像が出やすい。
      const drive=clamp(.12 + unit(features.edge)*.32 + unit(features.texture)*.26
        + unit(features.contrast*2.8)*.18 + rhythmic*.06,0,1);
      const quiet=Math.max(.08,1.25-drive*1.55), medium=.62+drive*.22;
      const active=.10+drive*1.30;
      this.motionProfile=weightedPick([quiet,medium,active],(hash ^ Math.imul(mutation+1,0xc2b2ae35) ^ 0x124fa3d1)>>>0);
      this.activity=[.40,1.05,2.45][this.motionProfile];
      this.motionMutation=mutation;

      // 縦/横ピクセルずれも、エッジや輪郭の向きと音の性格から出現確率を決める。
      const digital=clamp(unit(features.edge)*.58 + unit(features.orientation)*.28
        + rhythmic*.17,0,1);
      const onProb=clamp(.08+digital*.83,.08,.91);
      const signalSeed=(hash ^ Math.imul(mutation+1,0x27d4eb2f) ^ 0xb3ab27a9)>>>0;
      const enabled=random01(signalSeed)<onProb;
      const preferVertical=unit(features.orientation)*.45 + unit(features.balance*features.balance)*.3;
      this.signalDirection=enabled ? (random01(signalSeed^0x7f4a7c15)<.42+preferVertical*.25?2:1) : 0;
      this.signalDensity=.55 + ((hash>>>18)%5)*.12;
      this.baseBreath=(.70 + (hash%7)*.08) * [0.62,1.00,1.48][this.motionProfile];
      this.bpm=bpm; this.t=0; this.eventPulse=0; this.prevHit=0;
      this.history=null;this.historyAt=-100;this.sceneIndex=0;
      this.cachedPatches=this.makePatches(); this.prepareColorLayers(); this.prepareMotionLayers();
      this.safeRender();
    }
    setAudioState(state){
      const next=state||this.audio;
      const hit=next.hit||0;
      if(hit>this.prevHit+.16) this.eventPulse=Math.min(1,this.eventPulse + (hit-this.prevHit)*1.8 + .2);
      this.prevHit=hit;
      this.audio=next; this.energy=next?.env||0;
    }
    frame(stamp){
      // 描画負荷が大きい端末では自動でFPSを落とし、動画時間の進行速度は維持する。
      const interval=this.frameCost>38?140:this.frameCost>24?112:86;
      if(!this.lastDraw || stamp-this.lastDraw>=interval){
        const elapsed=this.lastDraw?Math.min((stamp-this.lastDraw)/1000,.75):0; this.lastDraw=stamp;
        this.eventPulse*=Math.pow(.08,elapsed*3.2);
        this.t += elapsed*(this.playing?1:.34); this.safeRender();
      }
      requestAnimationFrame(t=>this.frame(t));
    }
    makePatches(){
      const rng=n=>{const x=Math.sin(n*24.531+this.seed*194.21)*45678.382;return x-Math.floor(x);};
      const cells=this.features.cells||[],edges=this.features.edgeCells||[];
      const candidates=Array.from({length:16},(_,i)=>{
        const local=Math.abs((cells[i]??.5)-(Number(this.features.light)||.5));
        const edge=(edges[i]??0);
        return {i,score:local*.65+edge*.50+rng(i+17)*.18};
      }).sort((a,b)=>b.score-a.score);
      const selected=[],used=new Set();
      for(let i=0;i<candidates.length&&selected.length<5;i++){
        const {i:ci}=candidates[i], gx=ci%4,gy=Math.floor(ci/4);
        if([...used].some(j=>Math.abs(j%4-gx)+Math.abs(Math.floor(j/4)-gy)<2))continue;
        used.add(ci);selected.push(ci);
      }
      for(let i=0;selected.length<5;i++)selected.push(candidates[i].i);
      return selected.map((ci,i)=>({
        x:(ci%4+.28+rng(i*17+1)*.45)/4,
        y:(Math.floor(ci/4)+.22+rng(i*19+3)*.55)/4,
        rx:.12+.12*rng(i*19+5),ry:.11+.14*rng(i*23+6),
        phase:i*2.31+this.seed*7
      }));
    }
    prepareColorLayers(){
      // 撮影・MUTATE時にだけ画像の色変換とソフトマスクを焼き込む。
      // アニメーション中の全画素処理や毎フレームの画像色変換は避ける。
      if(!this.basePhoto){this.colorLayers=[];return;}
      const w=this.canvas.width,h=this.canvas.height;
      const patches=this.cachedPatches||this.makePatches();
      const palette=this.features.palette||[[.5,.6,.7],[.2,.7,.8],[.8,.3,.5]];
      const colorSchemes=[
        ['hue-rotate(28deg) saturate(1.45) contrast(1.04)','hue-rotate(-28deg) saturate(1.35)'],
        ['hue-rotate(68deg) saturate(1.55) contrast(.98)','hue-rotate(-55deg) saturate(1.45)'],
        ['hue-rotate(138deg) saturate(1.42)','hue-rotate(-105deg) saturate(1.45)'],
        ['saturate(.53) brightness(1.1) contrast(.92)','sepia(.32) saturate(.65) brightness(1.08)'],
        ['hue-rotate(158deg) saturate(.86) contrast(1.09)','hue-rotate(195deg) saturate(1.16)'],
        ['sepia(.30) saturate(1.35) contrast(1.04)','hue-rotate(-37deg) saturate(1.46)']
      ];
      this.colorLayers=[];
      for(let i=0;i<2;i++){
        const p=patches[(i*2+1)%patches.length], hue=this.colorProfile;
        const layer=document.createElement('canvas');layer.width=w;layer.height=h;
        const g=layer.getContext('2d',{alpha:true});
        g.save();
        if(typeof g.filter==='string')g.filter=colorSchemes[hue][i];
        g.drawImage(this.basePhoto,0,0,w,h);
        g.restore();
        // Safariのfilter非対応時も差が出るよう、薄いフィルム色を重ねる。
        const c=palette[(i+hue)%palette.length];
        g.globalCompositeOperation='source-atop';g.globalAlpha=.16;
        g.fillStyle=`rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`;
        g.fillRect(0,0,w,h);
        g.globalAlpha=1;g.globalCompositeOperation='source-over';
        const mask=document.createElement('canvas');mask.width=w;mask.height=h;
        const m=mask.getContext('2d');
        m.save();
        m.translate(p.x*w,p.y*h);
        const rx=Math.min(w,h)*(.28+.035*i), ry=rx*(.8+.30*Math.sin(this.seed*6+i));
        m.rotate(Math.sin(this.seed*4+i)*.3);
        m.scale(1,Math.max(.45,ry/rx));
        const grad=m.createRadialGradient(0,0,rx*.1,0,0,rx);
        grad.addColorStop(0,'rgba(255,255,255,.95)');
        grad.addColorStop(.42,'rgba(255,255,255,.84)');
        grad.addColorStop(.70,'rgba(255,255,255,.48)');
        grad.addColorStop(.91,'rgba(255,255,255,.10)');
        grad.addColorStop(1,'rgba(255,255,255,0)');
        m.fillStyle=grad;m.fillRect(-rx,-rx,rx*2,rx*2);
        m.restore();
        g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);
        g.globalCompositeOperation='source-over';
        this.colorLayers.push({canvas:layer,patch:p,rx,ry});
      }
    }
    prepareMotionLayers(){
      // 静止写真から柔らかい局所像を作る。高負荷なピクセル加工はMUTATE時だけ。
      this.motionLayers=[];
      if(!this.basePhoto) return;
      const w=this.canvas.width,h=this.canvas.height, patches=this.cachedPatches||this.makePatches();
      const softness=this.motionProfile===2?1.2:1;
      for(let i=0;i<4;i++){
        const p=patches[i%patches.length];
        const rx=Math.min(w,h)*(.27+(.055*i))*softness;
        const ry=rx*(.72+.14*Math.sin(this.seed*19+i*1.7));
        const x=p.x*w,y=p.y*h;
        const layer=document.createElement('canvas'); layer.width=w; layer.height=h;
        const g=layer.getContext('2d',{alpha:true});
        g.drawImage(this.basePhoto,0,0,w,h);
        const mask=document.createElement('canvas'); mask.width=w; mask.height=h;
        const m=mask.getContext('2d',{alpha:true});
        m.save(); m.translate(x,y);m.rotate(Math.sin(i*2.3+this.seed*9)*.26);
        m.scale(1,Math.max(.4,ry/rx));
        const gradient=m.createRadialGradient(0,0,rx*.05,0,0,rx);
        gradient.addColorStop(0,'rgba(255,255,255,1)');
        gradient.addColorStop(.40,'rgba(255,255,255,.96)');
        gradient.addColorStop(.65,'rgba(255,255,255,.72)');
        gradient.addColorStop(.86,'rgba(255,255,255,.28)');
        gradient.addColorStop(1,'rgba(255,255,255,0)');
        m.fillStyle=gradient;m.fillRect(-rx,-rx,rx*2,rx*2);m.restore();
        g.globalCompositeOperation='destination-in';g.drawImage(mask,0,0);
        g.globalCompositeOperation='source-over';
        this.motionLayers.push({canvas:layer,patch:p,cx:x,cy:y,rx,ry});
      }
    }
    // ソフトな領域像を平行移動・拡大・回転して再生する。矩形のマスクは生成しない。
    drawSoftLayer(ctx,layer,shiftX,shiftY,scale,rotation,alpha,mode='source-over'){
      const w=this.canvas.width,h=this.canvas.height;
      ctx.save();
      ctx.globalAlpha=clamp(alpha,0,.85);
      ctx.globalCompositeOperation=mode;
      ctx.translate(layer.cx+shiftX,layer.cy+shiftY);
      ctx.rotate(rotation);ctx.scale(scale,scale);ctx.translate(-layer.cx,-layer.cy);
      ctx.drawImage(layer.canvas,0,0,w,h);
      ctx.restore();
    }
    drawSoftEvolution(ctx,w,h,t,scene,low,mid,high,hit,phase){
      const family=this.visualFamily,act=this.activity, patches=this.motionLayers;
      const beat=t*this.bpm/60;
      const event=clamp(hit*.6+this.eventPulse*.8+high*.25,0,1);
      const grow=clamp(Math.sin(Math.PI*phase)*1.1,0,1);
      const base=Math.min(w,h);
      // 分岐ごとに動く原理を変える。全ての結果に規則的な楕円を一律適用しない。
      if(family===0){
        // LENS FLOAT — 静かな奥行き。画像の大部分はそのまま、油膜レンズがゆっくり移動。
        for(let i=0;i<3;i++){
          const a=t*(.24+i*.05)+i*2.1;
          this.drawSoftLayer(ctx,patches[i], Math.sin(a)*base*.06*act,Math.cos(a*.8)*base*.035*act,
            1+Math.sin(a*.65)*.035*act,Math.sin(a*.4)*.02*act,.28+scene*.18);
        }
      } else if(family===1){
        // TIDAL SHEAR — 複数の層が逆向きに流れる。動く距離の差が主役。
        for(let i=0;i<4;i++){
          const a=t*(.35+i*.09)+i*2.8;
          const drift=(.18+.075*i)*base*act;
          this.drawSoftLayer(ctx,patches[i],Math.sin(a)*drift,Math.cos(a*.67)*drift*.38,
            1+Math.sin(a*.7)*.065*act,Math.sin(a*.25)*.035*act,.25+scene*.28);
        }
      } else if(family===2){
        // IRIS — 一つの大きな楕円を開閉させ、局所写真が異なる倍率へ移行する。
        for(let i=0;i<3;i++){
          const a=t*.32+i*1.9,open=.5+.5*Math.sin(a);
          const size=1+(open*.40+grow*.30)*act;
          this.drawSoftLayer(ctx,patches[i], Math.sin(a*.6)*base*.07*act,
            Math.cos(a*.72)*base*.05*act,size,Math.sin(a*.36)*.045*act,
            .22+open*.40+event*.12);
        }
      } else if(family===3){
        // GLITCH BLOOM — 高速ビートに合わせて像が短時間だけ飛ぶ。普段は間を残す。
        const phaseBeat=(beat*2)%1;
        const kick=Math.pow(Math.max(0,1-phaseBeat*2.5),2);
        for(let i=0;i<3;i++){
          const a=Math.floor(beat*2+i*3)*1.37;
          const dx=Math.sin(a+i*2.2)*base*(.16+.08*i)*act*(kick+.25*event);
          const dy=Math.cos(a*.8+i)*base*.10*act*(kick+.15*event);
          this.drawSoftLayer(ctx,patches[i],dx,dy,1+kick*.11*act,Math.sin(a)*.05*act,
            clamp(.12+kick*.48+event*.25,0,.78));
        }
      } else if(family===4){
        // SOLVENT — 元の写真が複数の異なる露光像へ滲み広がり、戻る。
        for(let i=0;i<4;i++){
          const a=t*(.22+i*.08)+patches[i].patch.phase;
          this.drawSoftLayer(ctx,patches[i],Math.sin(a)*base*.12*act,
            Math.cos(a*.85)*base*.12*act,1+(grow*.22+Math.sin(a*.8)*.11)*act,
            Math.cos(a*.5)*.07*act,.30+scene*.28, i%2?'screen':'source-over');
        }
      } else if(family===5){
        // GHOST FIELD — 写真の時間差の像。過去のフレームは後段で混合。
        for(let i=0;i<3;i++){
          const a=t*(.16+i*.07)+i*2.8;
          this.drawSoftLayer(ctx,patches[i],Math.sin(a)*base*.13*act,
            Math.cos(a*.75)*base*.08*act,1+Math.sin(a*.48)*.1*act,
            Math.sin(a*.3)*.06*act,.17+scene*.16,'screen');
        }
      } else if(family===6){
        // CHROMA MORPH — 大きな写真像と色変換層を異なる方向に移す。
        for(let i=0;i<4;i++){
          const a=t*(.31+i*.11)+i*1.67;
          this.drawSoftLayer(ctx,patches[i],Math.sin(a)*base*.15*act,
            Math.cos(a*.55)*base*.16*act,1+Math.sin(a*.55)*.16*act,
            Math.sin(a*.62)*.09*act,.27+scene*.25);
        }
      } else {
        // COLLAPSE / RETURN — 一時的に写真を大きく崩す。最終的に原像へ回帰。
        const collapse=Math.pow(Math.sin(Math.PI*phase),1.2);
        const advance=act*(.30+.70*collapse);
        for(let i=0;i<4;i++){
          const a=t*(.42+i*.09)+i*2.1;
          const shift=base*(.20+i*.08)*advance;
          this.drawSoftLayer(ctx,patches[i],Math.sin(a)*shift,
            Math.cos(a*.73)*shift*.8,1+(collapse*.50+.10*Math.sin(a))*advance,
            Math.sin(a*.8)*.13*advance,.25+collapse*.35);
        }
      }
    }
    drawColorEvolution(ctx,w,h,t,scene,env,low,mid,high,jump){
      if(!this.colorLayers.length)return;
      // 光が現れる・溶ける・退色する周期を色系統ごとに分ける。
      const p=this.colorProfile, profileStrength=[.43,.52,.48,.40,.46,.45][p];
      const act=this.motionProfile===0?.70:this.motionProfile===2?1.35:1;
      const freq=(p===4?.45:p===1?.21:.32);
      for(let i=0;i<this.colorLayers.length;i++){
        const layer=this.colorLayers[i];
        const period=Math.sin(t*freq+i*1.7+this.seed*11);
        let appear=.5+.5*period;
        if(p===1)appear=Math.pow(appear,.65); // melt: long decay
        if(p===3)appear=.38+.32*Math.cos(t*.16+i*3); // bleaching, gradual
        if(p===4)appear=Math.pow(appear,1.75); // phosphor, sparse
        const visualBoost=[.80,1.10,1.0,1.0,1.25,.80,1.42,1.12][this.visualFamily];
        let alpha=(.10+appear*profileStrength)*(.4+scene*.55)*act*visualBoost;
        alpha*=1+Math.min(.35,jump*.2+high*.16+mid*.12);
        if(p===2)alpha*=.80+Math.sin(t*.34+i*2)*.14;
        const x=Math.sin(t*(.17+i*.12)+layer.patch.phase)*(12+mid*22+jump*12)*act;
        const y=Math.cos(t*(.13+i*.08)+layer.patch.phase)*(10+low*18)*act;
        const zoom=1+((p===1?.08:p===3?.05:.045)*act)*Math.sin(t*.3+i*1.7)+jump*.035*act;
        ctx.save();ctx.globalAlpha=clamp(alpha,0,.64);
        ctx.translate(w/2+x,h/2+y);ctx.scale(zoom,zoom);ctx.translate(-w/2,-h/2);
        ctx.drawImage(layer.canvas,0,0,w,h);
        ctx.restore();
      }
    }
    drawBreathingBase(ctx,photo,w,h,t,loopPhase,scene,low,mid,high,hit){
      // ベース写真全体の呼吸。領域を切り出さず、全面を一枚として変形する。
      // 拡大中心で描画し、黒い縁が出ないよう最小倍率を1以上に保つ。
      const act=this.baseBreath;
      const pace=this.visualFamily===3?0.7:this.visualFamily===7?.42:.22;
      const swing=Math.sin(t*pace+this.seed*9);
      const breath=(.5+.5*swing);
      const swell=Math.pow(Math.sin(Math.PI*loopPhase),2);
      const sound=clamp(low*.26+mid*.12+hit*.18+this.eventPulse*.15,0,.65);
      const zoom=1+act*(.013+.024*breath+.012*swell+.012*sound);
      const angle=act*.005*Math.sin(t*.20+this.seed*5);
      const shear=act*.009*Math.sin(t*.26+this.seed*3.2+mid*.6);
      const x=w*.5, y=h*.5;
      ctx.save();
      ctx.translate(x,y);
      ctx.transform(1,shear*.23,shear,1,0,0);
      ctx.rotate(angle);
      ctx.scale(zoom,zoom);
      ctx.drawImage(photo,-x,-y,w,h);
      ctx.restore();
    }
    drawSignalDrift(ctx,photo,w,h,t,beat,high,hit,jump,scene){
      // raster 的な縦横の画素移動。照明や矩形の色面は描画しない。
      // 切り口のある画像信号そのものの位相ずれとして扱う。
      const family=this.visualFamily;
      const digital=[.12,.70,.10,1.0,.10,.18,.63,.95][family];
      if(digital<=.18 && this.signalDirection===0)return;
      const mode=this.signalDirection || (family===3?1:family===7?2:0);
      if(!mode)return;
      const active=Math.max(.12,digital)*(.20 + scene*.42 + high*.20 + hit*.35 + jump*.28);
      const count=Math.round((2+this.signalDensity*4)*(family===3||family===7?1.3:1));
      const phase=Math.floor(beat*4); // 発音に近い時間格子で更新
      const quant=t*.7 + phase*.28;
      ctx.save();
      ctx.globalCompositeOperation='source-over';
      // 切断面は細い画素の移動だけ。中央の太い長方形や光線は描かない。
      for(let i=0;i<count;i++){
        const seed=this.seed*19+i*2.31;
        const gate=Math.sin(quant*.63+i*1.93+seed);
        if(gate < -.28)continue;
        const visible=(.12+.55*Math.abs(gate))*active;
        const step=Math.round((Math.sin(quant*1.9+seed*2.4)+Math.sin(quant*.56+seed))*22*visible);
        if(Math.abs(step)<1)continue;
        if(mode===1){
          const yy=Math.round((.05+.9*(i+.3)/count + .025*Math.sin(t*.34+seed))*h);
          const thick=Math.max(2,Math.round((2+this.signalDensity*8)*(1+.8*(i%3===0))));
          const sy=clamp(yy,0,h-thick);
          ctx.globalAlpha=clamp(.36+active*.58,0,.92);
          // source clipping avoids black borders; the original image remains beneath.
          ctx.drawImage(photo,0,sy,w,thick,step,sy,w,thick);
        } else {
          const xx=Math.round((.05+.9*(i+.3)/count + .025*Math.sin(t*.28+seed))*w);
          const thick=Math.max(2,Math.round((2+this.signalDensity*7)*(1+.6*(i%3===0))));
          const sx=clamp(xx,0,w-thick);
          ctx.globalAlpha=clamp(.34+active*.52,0,.90);
          ctx.drawImage(photo,sx,0,thick,h,sx,step,thick,h);
        }
      }
      ctx.restore();
    }
    drawLensRefraction(ctx,w,h,t,low,mid,high,jump,scene){
      // あらかじめフェザーを付けた写真片を、移動・拡大・屈折させる。
      // 四角いクリップではなく、楕円のソフトマスクを利用する。
      const family=this.visualFamily;
      const amount=[2,1,3,1,2,2,1,1][family];
      const minDim=Math.min(w,h);
      for(let i=0;i<amount;i++){
        const layer=this.motionLayers[(i+family)%this.motionLayers.length];
        if(!layer)continue;
        const a=t*(.29+i*.09)+layer.patch.phase+this.seed*6;
        const driftX=Math.sin(a)*minDim*(.065+.015*i)*this.activity;
        const driftY=Math.cos(a*.74)*minDim*(.038+.015*i)*this.activity;
        const depth=1+(.05+.08*Math.sin(a*.48))*(.75+.25*this.activity) + low*.035 + jump*.06;
        const alpha=clamp((.22+.17*scene+.14*low+.10*mid)*(family===0||family===2?1.22:.92),0,.67);
        this.drawSoftLayer(ctx,layer,driftX,driftY,depth,Math.sin(a*.32)*.045,alpha);
      }
    }
    drawLensBlob(ctx,x,y,rx,ry,hue,strength=1,tilt=0){
      ctx.save();
      ctx.translate(x,y); ctx.rotate(tilt); ctx.scale(1,ry/rx);
      const outer=ctx.createRadialGradient(0,0,rx*.08,0,0,rx);
      outer.addColorStop(0,`hsla(${(hue+10)%360}, 70%, 65%, ${0.015*strength})`);
      outer.addColorStop(.38,`hsla(${(hue+42)%360}, 85%, 62%, ${0.055*strength})`);
      outer.addColorStop(.63,`hsla(${(hue+170)%360}, 75%, 58%, ${0.045*strength})`);
      outer.addColorStop(.82,`hsla(${(hue+278)%360}, 78%, 65%, ${0.035*strength})`);
      outer.addColorStop(1,'rgba(0,0,0,0)');
      ctx.globalCompositeOperation='screen';
      ctx.fillStyle=outer; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
      const ring=ctx.createRadialGradient(0,0,rx*.45,0,0,rx*.98);
      ring.addColorStop(0,'rgba(0,0,0,0)');
      ring.addColorStop(.55,`hsla(${(hue+80)%360}, 85%, 72%, ${0.0})`);
      ring.addColorStop(.74,`hsla(${(hue+120)%360}, 95%, 74%, ${0.042*strength})`);
      ring.addColorStop(.83,`hsla(${(hue+220)%360}, 95%, 72%, ${0.056*strength})`);
      ring.addColorStop(.91,`hsla(${(hue+320)%360}, 90%, 74%, ${0.038*strength})`);
      ring.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=ring; ctx.beginPath(); ctx.arc(0,0,rx,0,Math.PI*2); ctx.fill();
      const inner=ctx.createRadialGradient(-rx*.12,-rx*.10,0,0,0,rx*.7);
      inner.addColorStop(0,`rgba(255,255,255,${0.018*strength})`);
      inner.addColorStop(.22,`rgba(255,255,255,${0.006*strength})`);
      inner.addColorStop(1,'rgba(255,255,255,0)');
      ctx.globalCompositeOperation='overlay';
      ctx.fillStyle=inner; ctx.beginPath(); ctx.arc(0,0,rx*.72,0,Math.PI*2); ctx.fill();
      ctx.restore();
    }

    drawSoundSlices(ctx,w,h,t,high,hit){
      if(high<.08 && hit<.08) return;
      ctx.save();
      ctx.globalCompositeOperation='screen';
      const blobs=2+Math.round(high*3+hit*3);
      for(let i=0;i<blobs;i++){
        const px=(.18+.64*((Math.sin(t*.9+i*1.77+this.seed*8)*.5)+.5))*w;
        const py=(.16+.68*((Math.cos(t*1.2+i*1.11+this.seed*6)*.5)+.5))*h;
        const rx=(.07+.03*Math.sin(i+t*.8)+high*.05+hit*.06)*Math.min(w,h);
        const ry=rx*(.36+.22*Math.cos(i+t*.6));
        const offX=Math.sin(t*6+i*1.4)*(2+high*8+hit*10);
        const offY=Math.cos(t*4+i*1.8)*(1+high*4+hit*5);
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(px,py,rx,ry,Math.sin(i+t)*.8,0,Math.PI*2);
        ctx.clip();
        ctx.globalAlpha=.035 + high*.05 + hit*.06;
        ctx.drawImage(this.basePhoto,offX,offY,w,h);
        ctx.restore();
      }
      ctx.restore();
    }
    pathOrganic(ctx,x,y,rx,ry,phase=0,rough=.16){
      const pts=10;
      for(let k=0;k<=pts;k++){
        const a=k/pts*Math.PI*2;
        const rr=1+rough*Math.sin(a*3+phase)+rough*.55*Math.cos(a*5-phase*.6)+rough*.35*Math.sin(a*7+phase*.3);
        const px=x+Math.cos(a)*rx*rr, py=y+Math.sin(a)*ry*rr;
        if(k===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
    }
    pathRibbon(ctx,w,h,yCenter,height,shift,phase=0){
      const steps=8;
      for(let k=0;k<=steps;k++){
        const t=k/steps;
        const x=t*w;
        const waveTop=Math.sin(t*4.4+phase)*height*.25 + Math.cos(t*2.2-phase*.6)*height*.12;
        const yy=yCenter-height+waveTop + shift*(t-.5)*.10;
        if(k===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
      }
      for(let k=steps;k>=0;k--){
        const t=k/steps;
        const x=t*w;
        const waveBot=Math.sin(t*4.0+phase+1.3)*height*.22 + Math.cos(t*2.6-phase*.35)*height*.10;
        const yy=yCenter+height+waveBot + shift*(t-.5)*.10;
        ctx.lineTo(x,yy);
      }
      ctx.closePath();
    }
    render(){
      if(!this.hasPhoto||!this.sourcePixels||!this.framePixels) return;
      this.render2D();
    }
    safeRender(){
      if(!this.hasPhoto) return;
      const start=performance.now();
      try{
        this.render(); this.lastRenderError=null; this.drawCount++;
      }catch(err){
        // iOS側で一部のCanvas表現が失敗しても、写真表示と次フレームは止めない。
        if(!this.lastRenderError || this.lastRenderError!==String(err)) console.warn('Visual fallback:',err);
        this.lastRenderError=String(err);
        if(this.basePhoto && this.ctx){
          this.ctx.save(); this.ctx.filter='none'; this.ctx.globalAlpha=1;
          this.ctx.globalCompositeOperation='source-over';
          this.ctx.drawImage(this.basePhoto,0,0,this.canvas.width,this.canvas.height);
          this.ctx.restore();
        }
      }finally{
        const cost=performance.now()-start;
        this.frameCost=this.frameCost?this.frameCost*.88+cost*.12:cost;
      }
    }
    // 8種類の動作文法に共通の呼吸・屈折・信号ずれを選択的に重ねる。
    // どの文法も少数のdrawImageだけを使い、全画素のJavaScript処理は行わない。
    drawMotion(ctx,photo,w,h,t,beat,amount,patches,low,mid,high,jump,scene){
      const phase=((t/Math.max(.001,this.duration))%1+1)%1;
      this.drawSoftEvolution(ctx,w,h,t,scene,low,mid,high,jump,phase);
    }
    render2D(){
      const ctx=this.ctx;
      const w=this.canvas.width,h=this.canvas.height;
      const photo=this.basePhoto;
      if(!photo) return;
      // 再生中はオーディオの時間を基準とし、変化が波形イベントと一致するようにする。
      const t=this.playing?((this.audio.phase||0)*this.duration):this.t;
      const loopPhase=((this.playing?(this.audio.phase||0):(t/this.duration)%1)+1)%1;
      const mode=this.visualFamily,beat=t*this.bpm/60;
      const env=this.audio.env||0,low=this.audio.low||0,mid=this.audio.mid||0;
      const high=this.audio.high||0,hit=this.audio.hit||0,pulse=this.eventPulse||0;
      const hueDrift=(t*13+high*65+pulse*120+(Number(this.features.hue)||0)*180)%360;
      const patches=this.cachedPatches||this.makePatches();
      const jump=hit*.45+pulse*.55;
      // 反復する呼吸ではなく、発芽→増殖→逸脱→沈静という時間的な起伏。
      // 低音エンジンでは大きく伸び、ビート系では短いピークを作る。
      const scene=loopPhase<.2?(.16+.56*loopPhase/.2):
        loopPhase<.50?(.72+.20*Math.sin((loopPhase-.20)/.30*Math.PI)):
        loopPhase<.78?(.88+.12*Math.sin((loopPhase-.50)/.28*Math.PI)):
        (.88-.63*(loopPhase-.78)/.22);
      const engineGain=[1,.95,.76,1.08,1.18,1.10,.72,.88,1.12,.8,.85,1.16][this.engine]||1;
      const amount=24*engineGain*this.activity*(.55+scene*.8)*(1+env*.18+jump*.62);

      // ネイティブ描画を中心に再構成。毎フレーム全画素をJavaScriptで走査しない。
      // iPhone Safariでの描画負荷を大幅に軽減し、音のアタックにも追従しやすくする。
      ctx.save();
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.filter='none';
      ctx.clearRect(0,0,w,h);
      this.drawBreathingBase(ctx,photo,w,h,t,loopPhase,scene,low,mid,high,hit);
      // 強い動作の一部では写真全体も変位させる。
      // 拡大した全面像を重ねるので、途中に直線的な切断面を作らない。
      if(this.activity>1 && [1,3,6,7].includes(this.visualFamily)){
        const strength=(this.activity-1)/1.45;
        const event=clamp(jump*.6+high*.2,0,1);
        const sweep=this.visualFamily===3?Math.floor(beat*2)/2:t;
        const fade=.16+.28*scene+.10*event;
        const waveX=Math.sin(sweep*(this.visualFamily===7?.83:.31)+this.seed*11);
        const waveY=Math.cos(sweep*(this.visualFamily===3?.9:.26)+this.seed*7);
        const zoom=1+.19*strength*(.4+.6*scene)+.045*event;
        ctx.save();
        ctx.globalAlpha=clamp(fade*strength,0,.50);
        ctx.translate(w/2,h/2);
        ctx.rotate(Math.sin(sweep*.32+this.seed*3)*.035*strength);
        ctx.scale(zoom,zoom);
        ctx.drawImage(photo,-w/2+waveX*w*.06*strength,-h/2+waveY*h*.065*strength,w,h);
        ctx.restore();
      }

      // 動作文法はMUTATEで切り替わる。過剰な重ね描きは避ける。
      this.drawMotion(ctx,photo,w,h,t,beat,amount,patches,low,mid,high,jump,scene);
      // 深さの違う楕円状の局所屈折を復活させる。
      this.drawLensRefraction(ctx,w,h,t,low,mid,high,jump,scene);
      // 写真そのものの色調が局所的に分化する。単なる明るい楕円は追加しない。
      this.drawColorEvolution(ctx,w,h,t,scene,env,low,mid,high,jump);
      // オイルレンズの馴染みを残す、共通の柔らかい局所屈折（最大2領域）。
      if(this.visualFamily===0 || this.visualFamily===2 || this.visualFamily===4){
        for(let i=0;i<(this.visualFamily===2?2:1);i++){
          const p=patches[i],cx=p.x*w,cy=p.y*h,rx=p.rx*w*.88,ry=p.ry*h*.82;
          const rate=this.recipe===3?Math.floor(t*7)/7:t;
          const sx=Math.sin(rate*(.57+i*.19)+p.phase+mid)*amount*.5;
          const sy=Math.cos(rate*(.43+i*.16)+p.phase+low)*amount*.32;
          ctx.save();ctx.beginPath();
          ctx.ellipse(cx,cy,rx,ry,.12*Math.sin(t*.3+p.phase),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=(.10+env*.10+jump*.12)*(.45+.55*scene);
          if(ctx.filter!==undefined)ctx.filter=`hue-rotate(${(hueDrift+i*22)%360}deg) saturate(${1.01+mid*.25})`;
          ctx.drawImage(photo,sx,sy,w,h);ctx.restore();
        }
      }
      ctx.restore();

      // 音のアタックに合わせた、画像の瞬間的な位置ジャンプ。
      // 穏やかなエンジンでは控えめ、RIFT/PULSE/PARTICLEなどは明確に反応。
      const rhythmic=[.38,1,.15,.85,.65,1,.15,.72,1,.55,.66,1][this.engine]||.5;
      if(jump>.15 && rhythmic>.4 && [1,3,6,7].includes(this.visualFamily)){
        const p=patches[Math.floor(t*this.bpm/60)%patches.length], cx=p.x*w,cy=p.y*h;
        ctx.save();ctx.beginPath();this.pathOrganic(ctx,cx,cy,p.rx*w*1.38,p.ry*h*1.32,t+p.phase,.10);ctx.clip();
        ctx.globalAlpha=Math.min(.42,jump*.44*rhythmic);
        ctx.drawImage(photo,Math.sin(t*3)*amount*.9,Math.cos(t*5)*amount*.65,w,h);ctx.restore();
      }
      // ディレイ感のある写真帯は音のアタックがある時のみ現れる。
      if(this.visualFamily===3 || this.visualFamily===7) this.drawSoundSlices(ctx,w,h,t,high,hit+pulse*.8);
      // 細い縦横のピクセルずれは、写真本来の画素だけで作る。
      this.drawSignalDrift(ctx,photo,w,h,t,beat,high,hit,jump,scene);

      // 色の塊ではなく、油膜やレンズ内の薄い干渉膜として処理。
      const palette=this.features.palette||[[.5,.6,.7],[.2,.7,.8],[.8,.3,.5]];
      // 常時3つの色膜を重ねない。動作文法と時間帯によって現れる回数を変える。
      const lensCount=([2,1,3,1,2,2,1,1])[this.visualFamily];
      const lensFade=this.visualFamily===2?(.58+.42*Math.sin(t*.29+this.seed*6)):(.34+.62*scene);
      for(let i=0;i<lensCount;i++){
        const p=patches[i],band=i===0?low:i===1?mid:high;
        const x=(p.x+Math.sin(t*(.16+i*.03)+this.seed+i)*(.03+.03*band)+this.audio.phase*.012*(i+1))*w;
        const y=(p.y+Math.cos(t*(.20+i*.02)+this.seed*1.3+i*1.1)*(.025+.03*band)+pulse*.03*Math.sin(i+t))*h;
        const radius=(Math.min(w,h)*(.13+i*.04))*(1.1+env*.12+mid*.12+pulse*.18+band*.35);
        const base=palette[i%palette.length];
        const hue=(Math.atan2(base[2]-base[1],base[0]-base[2])/Math.PI*180+360+hueDrift+i*18)%360;
        this.drawLensBlob(ctx,x,y,radius,radius*(.72+.23*Math.sin(t*.7+i)+band*.12),hue,(.40+band*.9+pulse*.50)*lensFade,.15*Math.sin(t*.6+i*2));
      }

      // 高音には短い色収差と残像。通常時の写真の視認性は保つ。
      if((high>.10||hit>.08||pulse>.06) && [2,3,5,6,7].includes(this.visualFamily)){
        ctx.save();ctx.globalCompositeOperation='screen';
        ctx.globalAlpha=(.020+high*.12+hit*.08+pulse*.11)*(.5+scene*.5);
        const j=1+Math.round(high*6+hit*5+pulse*4);
        if(ctx.filter!==undefined)ctx.filter=`hue-rotate(${(180+hueDrift)%360}deg) saturate(${1.12+high*.55+pulse*.4})`;
        ctx.drawImage(photo,j,-j,w,h);ctx.drawImage(photo,-j,j,w,h);
        ctx.restore();
      }
      // AFTERIMAGEの時だけ過去のフレームを薄く残す。静止画の単純な二重写しとは異なる。
      if(this.visualFamily===5){
        if(this.history){
          ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.055+.08*scene+.06*mid;
          ctx.drawImage(this.history,Math.sin(t*.31)*amount*.65,Math.cos(t*.41)*amount*.35,w,h);
          ctx.restore();
        }
        if(t-this.historyAt>1.35 || !this.history){
          if(!this.history){this.history=document.createElement('canvas');this.history.width=w;this.history.height=h;}
          if(this.history.width!==w||this.history.height!==h){this.history.width=w;this.history.height=h;}
          this.history.getContext('2d').drawImage(ctx.canvas,0,0);
          this.historyAt=t;
        }
      }
    }
    async pngBlob(){ return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed')),'image/png')); }
  }
  // Expose pure selection helpers for reproducibility / photo-bias tests.
  root.NWVisual = PhotoRenderer;
  root.NWVisualSelection={visualWeights,colorWeights,weightedPick};
})(window);
