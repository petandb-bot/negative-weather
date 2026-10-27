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
      this.resize(); window.addEventListener('resize',()=>this.resize(),{passive:true});
      requestAnimationFrame(t=>this.frame(t));
    }
    resize(){
      const box=this.canvas.getBoundingClientRect(); if(!box.width||!box.height) return;
      const scale=Math.min(window.devicePixelRatio||1,1.10,430/Math.max(box.width,box.height));
      this.canvas.width=Math.max(1,Math.round(box.width*scale)); this.canvas.height=Math.max(1,Math.round(box.height*scale));
      if(this.image) this.prepare2D();
      if(this.hasPhoto) this.safeRender();
    }
    setPhoto(image){
      this.image=image; this.hasPhoto=true; this.prepare2D();
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
    setMood(index,seed,features={},bpm=100,mutation=0){
      this.engine=index; this.seed=(seed%100000)/100000;
      this.features={hue:0,saturation:0,warm:0,cool:0,...features};
      // 写真の固有値から開始位置を決め、MUTATEでは必ず次の動作文法に進む。
      // 最初の6回は重複しないが、音響エンジン選択には影響させない。
      this.recipe=(((features.hash>>>0)%6)+(mutation%6))%6;
      this.bpm=bpm; this.t=0; this.eventPulse=0; this.prevHit=0; this.safeRender();
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
      const list=[]; const rng=n=>{ const x=Math.sin(n*24.531+this.seed*194.21)*45678.382; return x-Math.floor(x); };
      for(let i=0;i<5;i++) list.push({x:.10+.8*rng(i*17+1),y:.12+.74*rng(i*19+3),rx:.12+.16*rng(i*19+5),ry:.12+.18*rng(i*23+6),phase:i*2.31+this.seed*7});
      return list;
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
      const lines=2+Math.round(high*5+hit*3);
      for(let i=0;i<lines;i++){
        const y=((Math.sin(t*1.8+i*1.37+this.seed*9)*.5+.5)*h)|0;
        const hh=Math.max(2,Math.round((2+high*9+hit*7)*(i%2?1.5:1)));
        ctx.globalAlpha=.04 + high*.06 + hit*.08;
        ctx.drawImage(this.basePhoto,0,clamp(y-hh,0,h-1),w,hh,Math.sin(t*8+i)* (2+high*8+hit*10),y-hh,w,hh);
      }
      ctx.restore();
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
    drawMotion(ctx,photo,w,h,t,beat,amount,patches,low,mid,high,jump){
      const recipe=this.recipe, seed=this.seed;
      ctx.save(); ctx.globalCompositeOperation='source-over'; ctx.filter='none';
      if(recipe===0){
        // DRIFT：馴染みのあるゆるやかな横方向の流動。
        const n=6;
        for(let i=0;i<n;i++){
          const yy=Math.floor(i*h/n),hh=Math.ceil((i+1)*h/n)-yy;
          const off=Math.sin(i*1.42+t*.45+seed*11+mid)*amount*.75;
          ctx.globalAlpha=.34;
          ctx.drawImage(photo,0,yy,w,hh,off,yy,w,hh);
        }
      }else if(recipe===1){
        // COLUMN：縦に裂けた薄い写真帯が上下へ動く。建築物でも表情が変わる。
        const n=9;
        for(let i=0;i<n;i++){
          const xx=Math.floor(i*w/n),ww=Math.ceil((i+1)*w/n)-xx;
          const step=Math.round(Math.sin(i*1.71+t*(.68+high*.4)+seed*9)*amount*.72);
          ctx.globalAlpha=.62;
          ctx.drawImage(photo,xx,0,ww,h,xx,step,ww,h);
        }
      }else if(recipe===2){
        // RIPPLE：複数の同心レンズが、音の周波数変化で膨張・縮小する。
        for(let i=0;i<4;i++){
          const p=patches[(i+1)%patches.length];
          const x=p.x*w,y=p.y*h,r=Math.min(w,h)*(.14+i*.035)*(1+.25*low+.22*jump);
          ctx.save(); ctx.beginPath();
          ctx.ellipse(x,y,r,r*(.7+.1*Math.sin(t*.52+i)),.15*Math.sin(t*.4+i),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=.34+.07*mid;
          const sx=Math.sin(t*.54+p.phase)*amount*(.35+i*.12);
          const sy=Math.cos(t*.58+p.phase)*amount*(.25+i*.10);
          ctx.drawImage(photo,sx,sy,w,h);
          ctx.restore();
        }
      }else if(recipe===3){
        // SHUTTER：間欠的な走査。低FPSコンピューターらしい断続的な位置移動。
        const n=11,st=Math.floor(beat*2+seed*19);
        for(let i=0;i<n;i++){
          const yy=Math.floor(i*h/n),hh=Math.ceil((i+1)*h/n)-yy;
          const gate=((i*7+st*3)%11)<(3+Math.round(high*3+jump*3));
          if(!gate)continue;
          const off=Math.round(Math.sin(st*.67+i*2.09)*amount*(.55+jump*.45));
          ctx.globalAlpha=.68;
          ctx.drawImage(photo,0,yy,w,hh,off,yy,w,hh);
        }
      }else if(recipe===4){
        // SOLVENT：楕円の規則的なマスクではなく、有機的な輪郭のパッチが漂う。
        for(let i=0;i<4;i++){
          const p=patches[i],x=p.x*w,y=p.y*h,rx=p.rx*w*1.25,ry=p.ry*h*1.30;
          const phase=t*(.32+i*.07)+p.phase;
          ctx.save();ctx.beginPath();
          const points=10;
          for(let k=0;k<=points;k++){
            const a=k/points*Math.PI*2;
            const rr=1+.11*Math.sin(a*3+phase)+.09*Math.sin(a*5-phase*.6);
            const px=x+Math.cos(a)*rx*rr,py=y+Math.sin(a)*ry*rr;
            if(k===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
          }
          ctx.closePath();ctx.clip();ctx.globalAlpha=.3+.10*low;
          const offX=Math.cos(phase*.85)*amount*.9;
          const offY=Math.sin(phase*.6)*amount*.65;
          ctx.drawImage(photo,offX,offY,w,h);ctx.restore();
        }
      }else{
        // AFTERIMAGE：横帯ではなく少数の写真レイヤーが異なる時間に漂う。
        for(let i=0;i<3;i++){
          const p=patches[i+1];
          const offX=Math.sin(t*(.28+i*.13)+p.phase)*amount*(.45+i*.19);
          const offY=Math.cos(t*(.31+i*.09)+p.phase)*amount*(.25+i*.18);
          ctx.globalAlpha=.13+.08*high+.04*jump;
          ctx.globalCompositeOperation=i%2===0?'screen':'source-over';
          ctx.save();ctx.beginPath();
          ctx.rect(Math.max(0,(p.x-.2)*w),Math.max(0,(p.y-.28)*h),Math.min(w,.4*w),Math.min(h,.55*h));ctx.clip();
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
      const mode=this.engine%4,t=this.t,beat=t*this.bpm/60;
      const env=this.audio.env||0,low=this.audio.low||0,mid=this.audio.mid||0;
      const high=this.audio.high||0,hit=this.audio.hit||0,pulse=this.eventPulse||0;
      const hueDrift=(t*13+high*65+pulse*120+(Number(this.features.hue)||0)*180)%360;
      const patches=this.makePatches();
      const jump=hit*.45+pulse*.55;
      const amount=[18,30,25,27][mode]*(1+env*.23+jump*.32);

      // ネイティブ描画を中心に再構成。毎フレーム全画素をJavaScriptで走査しない。
      // iPhone Safariでの描画負荷を大幅に軽減し、音のアタックにも追従しやすくする。
      ctx.save();
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.filter='none';
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(photo,0,0,w,h);

      // 動作文法はMUTATEで切り替わる。過剰な重ね描きは避ける。
      this.drawMotion(ctx,photo,w,h,t,beat,amount,patches,low,mid,high,jump);
      // オイルレンズの馴染みを残す、共通の柔らかい局所屈折（最大2領域）。
      if(this.recipe!==2 && this.recipe!==4){
        for(let i=0;i<2;i++){
          const p=patches[i],cx=p.x*w,cy=p.y*h,rx=p.rx*w*.88,ry=p.ry*h*.82;
          const rate=this.recipe===3?Math.floor(t*7)/7:t;
          const sx=Math.sin(rate*(.57+i*.19)+p.phase+mid)*amount*.5;
          const sy=Math.cos(rate*(.43+i*.16)+p.phase+low)*amount*.32;
          ctx.save();ctx.beginPath();
          ctx.ellipse(cx,cy,rx,ry,.12*Math.sin(t*.3+p.phase),0,Math.PI*2);ctx.clip();
          ctx.globalAlpha=.12+env*.09+jump*.08;
          if(ctx.filter!==undefined)ctx.filter=`hue-rotate(${(hueDrift+i*22)%360}deg) saturate(${1.01+mid*.25})`;
          ctx.drawImage(photo,sx,sy,w,h);ctx.restore();
        }
      }
      ctx.restore();

      // ディレイ感のある写真帯は音のアタックがある時のみ現れる。
      this.drawSoundSlices(ctx,w,h,t,high,hit+pulse*.8);

      // 色の塊ではなく、油膜やレンズ内の薄い干渉膜として処理。
      const palette=this.features.palette||[[.5,.6,.7],[.2,.7,.8],[.8,.3,.5]];
      const lensCount=(this.recipe===1||this.recipe===3)?2:3;
      for(let i=0;i<lensCount;i++){
        const p=patches[i],band=i===0?low:i===1?mid:high;
        const x=(p.x+Math.sin(t*(.16+i*.03)+this.seed+i)*(.03+.03*band)+this.audio.phase*.012*(i+1))*w;
        const y=(p.y+Math.cos(t*(.20+i*.02)+this.seed*1.3+i*1.1)*(.025+.03*band)+pulse*.03*Math.sin(i+t))*h;
        const radius=(Math.min(w,h)*(.13+i*.04))*(1.1+env*.12+mid*.12+pulse*.18+band*.35);
        const base=palette[i%palette.length];
        const hue=(Math.atan2(base[2]-base[1],base[0]-base[2])/Math.PI*180+360+hueDrift+i*18)%360;
        this.drawLensBlob(ctx,x,y,radius,radius*(.72+.23*Math.sin(t*.7+i)+band*.12),hue,.68+band*.9+pulse*.65,.15*Math.sin(t*.6+i*2));
      }

      // 高音には短い色収差と残像。通常時の写真の視認性は保つ。
      if(high>.10||hit>.08||pulse>.06){
        ctx.save();ctx.globalCompositeOperation='screen';
        ctx.globalAlpha=.035+high*.11+hit*.08+pulse*.11;
        const j=1+Math.round(high*6+hit*5+pulse*4);
        if(ctx.filter!==undefined)ctx.filter=`hue-rotate(${(180+hueDrift)%360}deg) saturate(${1.12+high*.55+pulse*.4})`;
        ctx.drawImage(photo,j,-j,w,h);ctx.drawImage(photo,-j,j,w,h);
        ctx.restore();
      }
      if(low>.06||pulse>.04){
        ctx.save();ctx.strokeStyle=`rgba(255,255,255,${.015+low*.04+pulse*.04})`;
        ctx.lineWidth=1+low*3+pulse*3;ctx.strokeRect(0,0,w,h);ctx.restore();
      }
    }
    async pngBlob(){ return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed')),'image/png')); }
  }
  root.NWVisual = PhotoRenderer;
})(window);
