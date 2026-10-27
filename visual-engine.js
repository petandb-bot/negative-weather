(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
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
      this.colorProfile=0; this.motionProfile=0; this.colorLayers=[]; this.cachedPatches=null;
      this.resize(); window.addEventListener('resize',()=>this.resize(),{passive:true});
      requestAnimationFrame(t=>this.frame(t));
    }
    resize(){
      const box=this.canvas.getBoundingClientRect(); if(!box.width||!box.height) return;
      const scale=Math.min(window.devicePixelRatio||1,1.10,430/Math.max(box.width,box.height));
      this.canvas.width=Math.max(1,Math.round(box.width*scale)); this.canvas.height=Math.max(1,Math.round(box.height*scale));
      if(this.image) { this.prepare2D(); this.prepareColorLayers(); }
      if(this.hasPhoto) this.safeRender();
    }
    setPhoto(image){
      this.image=image; this.hasPhoto=true; this.history=null;this.historyAt=-100;this.prepare2D();
      this.cachedPatches=this.makePatches(); this.prepareColorLayers();
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
      // 写真の固有値から開始位置を決め、MUTATEでは必ず次の動作文法に進む。
      // 最初の6回は重複しないが、音響エンジン選択には影響させない。
      this.recipe=(((features.hash>>>0)%6)+(mutation%6))%6;
      // 動き・色変異・強度は独立したDNAとし、同じ映像結果の連続を避ける。
      this.colorProfile=((((features.hash>>>7)%6)+mutation)%6);
      this.motionProfile=((((features.hash>>>14)%3)+Math.floor(mutation/2))%3);
      this.bpm=bpm; this.t=0; this.eventPulse=0; this.prevHit=0;
      this.history=null;this.historyAt=-100;this.sceneIndex=0;
      this.cachedPatches=this.makePatches(); this.prepareColorLayers();
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
    drawColorEvolution(ctx,w,h,t,scene,env,low,mid,high,jump){
      if(!this.colorLayers.length)return;
      // 光が現れる・溶ける・退色する周期を色系統ごとに分ける。
      const p=this.colorProfile, profileStrength=[.43,.52,.48,.40,.46,.45][p];
      const act=this.motionProfile===0?.70:this.motionProfile===2?1.18:1;
      const freq=(p===4?.45:p===1?.21:.32);
      for(let i=0;i<this.colorLayers.length;i++){
        const layer=this.colorLayers[i];
        const period=Math.sin(t*freq+i*1.7+this.seed*11);
        let appear=.5+.5*period;
        if(p===1)appear=Math.pow(appear,.65); // melt: long decay
        if(p===3)appear=.38+.32*Math.cos(t*.16+i*3); // bleaching, gradual
        if(p===4)appear=Math.pow(appear,1.75); // phosphor, sparse
        let alpha=(.10+appear*profileStrength)*( .4+scene*.55 )*act;
        alpha*=1+Math.min(.35,jump*.2+high*.16+mid*.12);
        if(p===2)alpha*=.80+Math.sin(t*.34+i*2)*.14;
        const x=Math.sin(t*(.17+i*.12)+layer.patch.phase)*(12+mid*14+jump*8)*act;
        const y=Math.cos(t*(.13+i*.08)+layer.patch.phase)*(10+low*12)*act;
        const zoom=1+(p===1?.04:p===3?.02:.015)*Math.sin(t*.3+i*1.7)+jump*.02;
        ctx.save();ctx.globalAlpha=clamp(alpha,0,.64);
        ctx.translate(w/2+x,h/2+y);ctx.scale(zoom,zoom);ctx.translate(-w/2,-h/2);
        ctx.drawImage(layer.canvas,0,0,w,h);
        ctx.restore();
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
    // 写真のカラーと輪郭を守ったまま、動作そのものを6つに分ける。
    // どの文法も少数のdrawImageだけを使い、全画素のJavaScript処理は行わない。
    drawMotion(ctx,photo,w,h,t,beat,amount,patches,low,mid,high,jump,scene){
      const recipe=this.recipe, seed=this.seed;
      ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.filter='none';
      if(recipe===0){
        // DRIFT：丸い油膜窓がゆっくり位置を変えながら写真を屈折させる。
        for(let i=0;i<3;i++){
          const p=patches[i];
          const x=(p.x+.06*Math.sin(t*.19+i+seed*7))*w;
          const y=(p.y+.05*Math.cos(t*.17+i*.7+seed*5))*h;
          const rx=(p.rx*1.35+.06+.04*Math.sin(i+t*.3))*w;
          const ry=(p.ry*1.05+.04+.03*Math.cos(i+t*.24))*h;
          const offX=Math.sin(t*(.45+i*.08)+p.phase)*amount*(.45+i*.16);
          const offY=Math.cos(t*(.39+i*.06)+p.phase)*amount*(.30+i*.10);
          ctx.save();ctx.beginPath();ctx.ellipse(x,y,rx,ry,.18*Math.sin(t*.2+i),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=.18+.18*scene;
          ctx.drawImage(photo,offX,offY,w,h);ctx.restore();
        }
      }else if(recipe===1){
        // BEND：細長い楕円の膜がしなる。矩形帯ではなく有機的な縦方向の気配。
        for(let i=0;i<4;i++){
          const x=(.18+i*.18+Math.sin(t*.15+i+seed*9)*.05)*w;
          const y=(.52+.08*Math.cos(t*.22+i*1.4))*h;
          const rx=(.07+.02*Math.sin(i+t*.31))*w;
          const ry=(.26+.06*Math.cos(i+t*.23))*h;
          const offX=Math.sin(i*1.4+t*.9+seed*7)*amount*(.42+.12*i);
          const offY=Math.cos(i*1.2+t*.7+seed*5)*amount*.22;
          ctx.save();ctx.beginPath();ctx.ellipse(x,y,rx,ry,.18*Math.sin(t*.35+i),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=.14+.16*scene;
          ctx.drawImage(photo,offX,offY,w,h);ctx.restore();
        }
      }else if(recipe===2){
        // RIPPLE：複数のレンズ状の波紋。
        for(let i=0;i<4;i++){
          const p=patches[(i+1)%patches.length];
          const x=(p.x+.02*Math.sin(t*.13+i))*w,y=(p.y+.02*Math.cos(t*.15+i))*h;
          const r=Math.min(w,h)*(.11+i*.045)*(1+.15*scene+.31*low+.35*jump);
          ctx.save(); ctx.beginPath();
          ctx.ellipse(x,y,r,r*(.72+.12*Math.sin(t*.52+i)),.18*Math.sin(t*.4+i),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=.20+.18*scene+.10*mid;
          const sx=Math.sin(t*.54+p.phase)*amount*(.35+i*.12);
          const sy=Math.cos(t*.58+p.phase)*amount*(.25+i*.10);
          ctx.drawImage(photo,sx,sy,w,h);
          ctx.restore();
        }
      }else if(recipe===3){
        // PULSE：音のアタックで丸い気泡が現れて弾む。
        const step=Math.floor(beat*2+seed*19);
        for(let i=0;i<4;i++){
          const gate=((i*7+step*3)%11)<(2+Math.round(scene*4+high*3+jump*3));
          if(!gate) continue;
          const p=patches[(i+2)%patches.length];
          const x=(p.x+.05*Math.sin(step*.4+i))*w;
          const y=(p.y+.06*Math.cos(step*.5+i))*h;
          const rx=(p.rx*1.05+.02+jump*.10)*w;
          const ry=(p.ry*.95+.02+jump*.08)*h;
          const off=Math.sin(step*.67+i*2.09)*amount*(.42+jump*.35);
          ctx.save();ctx.beginPath();ctx.ellipse(x,y,rx,ry,.22*Math.sin(step*.3+i),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=.18+.22*scene;
          ctx.drawImage(photo,off,Math.sin(i+t*2)*amount*.08,w,h);ctx.restore();
        }
      }else if(recipe===4){
        // SOLVENT：有機的な輪郭のパッチが漂う。
        for(let i=0;i<4;i++){
          const p=patches[i],x=p.x*w,y=p.y*h,rx=p.rx*w*1.30,ry=p.ry*h*1.32;
          const phase=t*(.32+i*.07)+p.phase;
          ctx.save();ctx.beginPath();
          this.pathOrganic(ctx,x,y,rx,ry,phase,.14);ctx.clip();ctx.globalAlpha=.20+.20*scene+.10*low;
          const offX=Math.cos(phase*.85)*amount*.90;
          const offY=Math.sin(phase*.6)*amount*.68;
          ctx.drawImage(photo,offX,offY,w,h);ctx.restore();
        }
      }else{
        // AFTERIMAGE：丸い残像の群れ。
        for(let i=0;i<3;i++){
          const p=patches[i+1];
          const offX=Math.sin(t*(.28+i*.13)+p.phase)*amount*(.50+i*.18);
          const offY=Math.cos(t*(.31+i*.09)+p.phase)*amount*(.28+i*.16);
          ctx.globalAlpha=.09+.12*scene+.08*high+.04*jump;
          ctx.globalCompositeOperation=i%2===0?'screen':'source-over';
          ctx.save();ctx.beginPath();
          ctx.ellipse(p.x*w,p.y*h,p.rx*w*1.55,p.ry*h*1.60,.22*Math.sin(t*.4+i),0,Math.PI*2);ctx.clip();
          ctx.drawImage(photo,offX,offY,w,h);ctx.restore();
        }
      }
      ctx.restore();
    }
    render2D(){
      const ctx=this.ctx;
      const w=this.canvas.width,h=this.canvas.height;
      const photo=this.basePhoto;
      if(!photo) return;
      // 再生中はオーディオの時間を基準とし、変化が波形イベントと一致するようにする。
      const t=this.playing?((this.audio.phase||0)*this.duration):this.t;
      const loopPhase=((this.playing?(this.audio.phase||0):(t/this.duration)%1)+1)%1;
      const mode=this.engine%4,beat=t*this.bpm/60;
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
      const amount=[20,32,26,29][mode]*engineGain*([.65,.95,1.26][this.motionProfile]||1)*(.62+scene*.75)*(1+env*.18+jump*.62);

      // ネイティブ描画を中心に再構成。毎フレーム全画素をJavaScriptで走査しない。
      // iPhone Safariでの描画負荷を大幅に軽減し、音のアタックにも追従しやすくする。
      ctx.save();
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.filter='none';
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(photo,0,0,w,h);

      // 動作文法はMUTATEで切り替わる。過剰な重ね描きは避ける。
      this.drawMotion(ctx,photo,w,h,t,beat,amount,patches,low,mid,high,jump,scene);
      // 写真そのものの色調が局所的に分化する。単なる明るい楕円は追加しない。
      this.drawColorEvolution(ctx,w,h,t,scene,env,low,mid,high,jump);
      // オイルレンズの馴染みを残す、共通の柔らかい局所屈折（最大2領域）。
      if(true){
        for(let i=0;i<([2,2,3,2,2,3][this.recipe]||2);i++){
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
      if(jump>.15 && rhythmic>.4){
        const p=patches[Math.floor(t*this.bpm/60)%patches.length], cx=p.x*w,cy=p.y*h;
        ctx.save();ctx.beginPath();this.pathOrganic(ctx,cx,cy,p.rx*w*1.38,p.ry*h*1.32,t+p.phase,.10);ctx.clip();
        ctx.globalAlpha=Math.min(.42,jump*.44*rhythmic);
        ctx.drawImage(photo,Math.sin(t*3)*amount*.9,Math.cos(t*5)*amount*.65,w,h);ctx.restore();
      }
      // ディレイ感のある写真帯は音のアタックがある時のみ現れる。
      if(this.recipe===1 || this.recipe===3 || this.recipe===5) this.drawSoundSlices(ctx,w,h,t,high,hit+pulse*.8);

      // 色の塊ではなく、油膜やレンズ内の薄い干渉膜として処理。
      const palette=this.features.palette||[[.5,.6,.7],[.2,.7,.8],[.8,.3,.5]];
      // 常時3つの色膜を重ねない。動作文法と時間帯によって現れる回数を変える。
      const lensCount=([2,2,3,2,2,3])[this.recipe];
      const lensFade=this.recipe===2?(.58+.42*Math.sin(t*.29+this.seed*6)):(.34+.62*scene);
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
      if(high>.10||hit>.08||pulse>.06){
        ctx.save();ctx.globalCompositeOperation='screen';
        ctx.globalAlpha=(.020+high*.12+hit*.08+pulse*.11)*(.5+scene*.5);
        const j=1+Math.round(high*6+hit*5+pulse*4);
        if(ctx.filter!==undefined)ctx.filter=`hue-rotate(${(180+hueDrift)%360}deg) saturate(${1.12+high*.55+pulse*.4})`;
        ctx.drawImage(photo,j,-j,w,h);ctx.drawImage(photo,-j,j,w,h);
        ctx.restore();
      }
      // AFTERIMAGEの時だけ過去のフレームを薄く残す。静止画の単純な二重写しとは異なる。
      if(this.recipe===5){
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
  root.NWVisual = PhotoRenderer;
})(window);
