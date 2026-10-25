(function(root){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  class PhotoRenderer {
    constructor(canvas){
      this.canvas=canvas;
      this.ctx=canvas.getContext('2d',{willReadFrequently:true});
      this.image=null; this.basePhoto=null; this.sourcePixels=null; this.framePixels=null;
      this.energy=0; this.engine=0; this.seed=.5; this.t=0; this.playing=false; this.bpm=100;
      this.features={motion:.4,palette:[[.45,.5,.5],[.2,.7,.8],[.8,.3,.5]]};
      this.audio={env:0,low:0,mid:0,high:0,hit:0,phase:0}; this.hasPhoto=false;
      this.lastDraw=0;
      this.resize(); window.addEventListener('resize',()=>this.resize(),{passive:true});
      requestAnimationFrame(t=>this.frame(t));
    }
    resize(){
      const box=this.canvas.getBoundingClientRect(); if(!box.width||!box.height) return;
      const scale=Math.min(window.devicePixelRatio||1,1.25,520/Math.max(box.width,box.height));
      this.canvas.width=Math.max(1,Math.round(box.width*scale)); this.canvas.height=Math.max(1,Math.round(box.height*scale));
      if(this.image) this.prepare2D();
      if(this.hasPhoto) this.render();
    }
    setPhoto(image){ this.image=image; this.hasPhoto=true; this.prepare2D(); this.render(); }
    prepare2D(){
      if(!this.ctx||!this.image) return;
      const w=this.canvas.width,h=this.canvas.height;
      const src=document.createElement('canvas'); src.width=w; src.height=h;
      const g=src.getContext('2d',{willReadFrequently:true});
      const scale=Math.max(w/this.image.width,h/this.image.height);
      g.drawImage(this.image,(w-this.image.width*scale)/2,(h-this.image.height*scale)/2,this.image.width*scale,this.image.height*scale);
      this.basePhoto=src; this.sourcePixels=g.getImageData(0,0,w,h).data; this.framePixels=this.ctx.createImageData(w,h);
    }
    setMood(index,seed,features={},bpm=100){ this.engine=index; this.seed=(seed%100000)/100000; this.features=features; this.bpm=bpm; this.t=0; this.render(); }
    setAudioState(state){ this.audio=state||this.audio; this.energy=state?.env||0; }
    frame(stamp){
      const interval=70; // low-ish fps for early-computer movement
      if(!this.lastDraw || stamp-this.lastDraw>=interval){
        const elapsed=this.lastDraw?Math.min((stamp-this.lastDraw)/1000,.12):0; this.lastDraw=stamp;
        this.t += elapsed*(this.playing?1:.34); this.render();
      }
      requestAnimationFrame(t=>this.frame(t));
    }
    makePatches(){
      const list=[]; const rng=n=>{ const x=Math.sin(n*24.531+this.seed*194.21)*45678.382; return x-Math.floor(x); };
      for(let i=0;i<5;i++) list.push({x:.10+.8*rng(i*17+1),y:.12+.74*rng(i*19+3),rx:.12+.16*rng(i*19+5),ry:.12+.18*rng(i*23+6),phase:i*2.31+this.seed*7});
      return list;
    }
    render(){
      if(!this.hasPhoto||!this.sourcePixels||!this.framePixels) return; this.render2D();
    }
    render2D(){
      const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,src=this.sourcePixels,dst=this.framePixels.data;
      const mode=this.engine,t=this.t,clock=(mode===1||mode===3)?Math.floor(t*10)/10:t, beat=t*this.bpm/60;
      const env=this.audio.env||0, low=this.audio.low||0, mid=this.audio.mid||0, high=this.audio.high||0, hit=this.audio.hit||0;
      const cell=18,gw=Math.ceil(w/cell)+2,gh=Math.ceil(h/cell)+2, patches=this.makePatches();
      const dx=new Float32Array(gw*gh), dy=new Float32Array(gw*gh);
      const amount=[22,32,26,28][mode]*(1+env*.32+hit*.18);
      const hueDrift=(t*10 + high*45 + this.features.hue*180) % 360;
      for(let gy=0;gy<gh;gy++) for(let gx=0;gx<gw;gx++){
        const x=gx*cell/w,y=gy*cell/h,i=gy*gw+gx;
        let vx=.38*Math.sin(y*8.9+clock*.55+this.seed*8)+.23*Math.cos(x*6.2-clock*.42+high*3);
        let vy=.32*Math.cos(x*7.5-clock*.47)+.29*Math.sin(y*8.1+clock*.5+low*2);
        for(const p of patches){
          const rr=Math.hypot((x-p.x)/p.rx,(y-p.y)/p.ry), a=clamp((1.14-rr)/.58,0,1), soft=a*a*(3-2*a);
          vx+=soft*Math.sin(clock*(.45+p.x)+p.phase+mid*2)*.88; vy+=soft*Math.cos(clock*(.48+p.y)+p.phase+high*3)*.75;
        }
        if(mode===1){ vx += .35*Math.sin(Math.floor(y*11+this.seed*7)+Math.floor(beat*2+hit*2)*.6); vy += .08*Math.sin(x*13+clock*2); }
        if(mode===2){ vx += .28*Math.sin(y*10+clock*.7+low); vy += .32*Math.cos(x*7-clock*.4+mid); }
        if(mode===3){ vx += .20*Math.sin(Math.floor(clock*8)+x*20+high*4); vy += .18*Math.cos(Math.floor(clock*6)+y*16+high*3); }
        dx[i]=vx*amount; dy[i]=vy*amount;
      }
      for(let y=0;y<h;y++){
        const gy=Math.floor(y/cell), fy=(y%cell)/cell, row=y*w;
        for(let x=0;x<w;x++){
          const gx=Math.floor(x/cell), fx=(x%cell)/cell, p=gy*gw+gx, q=p+gw;
          const ddx=dx[p]+(dx[p+1]-dx[p])*fx, ddy=dx[q]+(dx[q+1]-dx[q])*fx;
          const edx=dy[p]+(dy[p+1]-dy[p])*fx, edy=dy[q]+(dy[q+1]-dy[q])*fx;
          const sx=clamp(Math.round(x+ddx+(ddy-ddx)*fy),0,w-1), sy=clamp(Math.round(y+edx+(edy-edx)*fy),0,h-1);
          const a=(row+x)*4, b=(sy*w+sx)*4;
          let rr=src[b], gg=src[b+1], bb=src[b+2];
          if(high>.12){
            const shift=Math.round(1+high*4+hit*2);
            const b2=(clamp(sy+shift,0,h-1)*w+clamp(sx-shift,0,w-1))*4;
            rr=rr*(1-high*.08)+src[b2]*high*.08; bb=bb*(1-high*.12)+src[b2+2]*high*.12;
          }
          if(low>.1){
            const warm=low*.08 + this.features.warm*.04; rr=clamp(rr*(1+warm),0,255); gg=clamp(gg*(1+warm*.3),0,255);
          }
          if(mid>.1){
            const cool=mid*.06 + this.features.cool*.04; bb=clamp(bb*(1+cool),0,255); gg=clamp(gg*(1+cool*.2),0,255);
          }
          dst[a]=rr; dst[a+1]=gg; dst[a+2]=bb; dst[a+3]=255;
        }
      }
      ctx.putImageData(this.framePixels,0,0);
      // Internal events: redraw several photo patches with time lag and tinted filters.
      ctx.save();
      for(let i=0;i<3;i++){
        const p=patches[i+1], cx=p.x*w, cy=p.y*h, rx=p.rx*w*.78, ry=p.ry*h*.72;
        const shift=mode===1?Math.floor(clock*7)/7:clock;
        const xx=Math.sin(shift*(.85+i*.17)+p.phase+hit*3)*(mode===2?44:30)*(1+env*.4);
        const yy=Math.cos(shift*(.71+i*.12)+p.phase+low*2)*(mode===2?40:24)*(1+env*.2);
        ctx.save(); ctx.beginPath(); const wobble=1+.16*Math.sin(clock*.9+i*2.3+mid);
        ctx.ellipse(cx,cy,rx*wobble,ry/wobble,.17*Math.sin(shift*.37+p.phase),0,Math.PI*2); ctx.clip();
        ctx.globalAlpha=.18+.16*env+.12*hit;
        ctx.filter=`hue-rotate(${(hueDrift + i*36)%360}deg) saturate(${1.1+this.features.saturation*.7+high*.5}) contrast(${1.02+mid*.3})`;
        ctx.drawImage(this.basePhoto,xx,yy,w,h);
        ctx.restore();
      }
      ctx.restore();
      ctx.filter='none';

      // Color metabolism: translucent gradients tied to audio bands.
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      const colors=this.features.palette||[[.5,.6,.7],[.2,.7,.8],[.8,.3,.5]];
      const blobPower=.04 + env*.10 + mid*.08;
      for(let i=0;i<3;i++){
        const p=patches[i];
        const x=(p.x + Math.sin(t*.12+i+this.seed)*.08 + this.audio.phase*.02)*w;
        const y=(p.y + Math.cos(t*.15+i*1.2+this.seed)*.05)*h;
        const rad=(Math.min(w,h)*(.18 + i*.03))*(1+blobPower+((i===0?low:i===1?mid:high)*.6));
        const g=ctx.createRadialGradient(x,y,0,x,y,rad);
        const c=colors[i%colors.length].map(v=>Math.round(v*255));
        g.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},${0.10 + (i===0?low:i===1?mid:high)*.16})`);
        g.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,rad,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();

      // Spectral afterimage flashes for high-frequency accents.
      if(high>.12 || hit>.1){
        ctx.save(); ctx.globalAlpha=.06 + high*.18 + hit*.12; ctx.globalCompositeOperation='screen';
        const jitter=2 + Math.round(high*8 + hit*4);
        ctx.filter=`hue-rotate(${(180+hueDrift)%360}deg) saturate(${1.2+high*.8})`;
        ctx.drawImage(this.basePhoto,jitter,-jitter,w,h); ctx.drawImage(this.basePhoto,-jitter,jitter,w,h);
        ctx.restore();
      }

      // Low-end breathing.
      if(low>.08){
        ctx.save(); ctx.strokeStyle=`rgba(255,255,255,${0.02 + low*.05})`; ctx.lineWidth=1 + low*4;
        ctx.strokeRect(0,0,w,h); ctx.restore();
      }
    }
    async pngBlob(){ return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed')),'image/png')); }
  }
  root.NWVisual = PhotoRenderer;
})(window);
