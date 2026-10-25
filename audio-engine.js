/*
 * NEGATIVE WEATHER — Image-to-Sound synthesis
 * 画像の特徴量を直接「明るい写真 = 高音」と変換するのではなく、
 * 独立した4つの音楽エンジンの素材選択・密度・倍音の偏りへ使う。
 * クラウドや外部音源を使わず、端末内で合成したFloat32 PCMをWAV化する。
 */
(function(root){
  'use strict';
  const SR=22050;
  const TAU=Math.PI*2;
  const ENGINES=['VEIL','PULSE','CURRENT','PARTICLE'];
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  class Random {
    constructor(seed){this.x=(seed>>>0)||1234567;}
    next(){let x=this.x;x^=x<<13;x^=x>>>17;x^=x<<5;this.x=x>>>0;return (this.x>>>0)/4294967296;}
    range(a,b){return a+(b-a)*this.next();}
    pick(arr){return arr[Math.floor(this.next()*arr.length)];}
    chance(v){return this.next()<v;}
  }
  // 写真を160pxへ縮小して、色・局所密度・方向性・空間的な偏りを抽出する。
  // 被写体を機械学習で分類するのではなく、画像の構造そのものを楽曲の素性とする。
  function analyzeImage(img){
    const S=160, c=document.createElement('canvas'); c.width=c.height=S;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const scale=Math.max(S/img.width,S/img.height);
    ctx.drawImage(img,(S-img.width*scale)/2,(S-img.height*scale)/2,img.width*scale,img.height*scale);
    const p=ctx.getImageData(0,0,S,S).data;
    const lum=new Float32Array(S*S), cells=new Float32Array(16), colorCells=new Float32Array(16);
    let hash=2166136261>>>0,light=0,saturation=0,red=0,green=0,blue=0,left=0,right=0;
    let hueX=0,hueY=0;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      const i=y*S+x,k=i*4,r=p[k]/255,g=p[k+1]/255,b=p[k+2]/255;
      const l=.2126*r+.7152*g+.0722*b;
      const mx=Math.max(r,g,b),mn=Math.min(r,g,b),ch=mx-mn;
      let hue=0;
      if(ch>.0001){
        if(mx===r)hue=((g-b)/ch)%6;
        else if(mx===g)hue=(b-r)/ch+2;
        else hue=(r-g)/ch+4;
        hue=(hue/6+1)%1;
        hueX+=Math.cos(hue*TAU)*ch;hueY+=Math.sin(hue*TAU)*ch;
      }
      lum[i]=l;light+=l;saturation+=ch;red+=r;green+=g;blue+=b;
      if(x<S/2)left+=l;else right+=l;
      const ci=(Math.floor(y/40))*4+Math.floor(x/40);cells[ci]+=l;colorCells[ci]+=ch;
      if(i%13===0){hash^=(p[k]+p[k+1]*3+p[k+2]*7)&255;hash=Math.imul(hash,16777619)>>>0;}
    }
    const size=S*S;light/=size;saturation/=size;red/=size;green/=size;blue/=size;
    for(let i=0;i<16;i++){cells[i]/=1600;colorCells[i]/=1600;}
    let e=0,variance=0,ex=0,ey=0,bright=0,blockVar=0;
    const gridTexture=new Float32Array(16);
    for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){
      const i=y*S+x,dx=Math.abs(lum[i+1]-lum[i-1])*.5,dy=Math.abs(lum[i+S]-lum[i-S])*.5;
      const local=dx+dy;
      variance+=(lum[i]-light)**2;e+=local;ex+=dx;ey+=dy;
      if(lum[i]>.82)bright++;
      gridTexture[(Math.floor(y/40))*4+Math.floor(x/40)]+=local;
    }
    const inner=(S-2)*(S-2), contrast=Math.sqrt(variance/inner);
    for(let i=0;i<16;i++){
      gridTexture[i]=clamp(gridTexture[i]/1550*3,0,1);
      blockVar+=(cells[i]-light)**2;
    }
    let textured=0;
    for(let i=0;i<16;i++)textured+=(gridTexture[i]-e/inner*3)**2;
    const edge=clamp(e/inner*2.4,0,1);
    const orientation=clamp(Math.abs(ex-ey)/Math.max(ex+ey,.001),0,1);
    const spatialContrast=clamp(Math.sqrt(blockVar/16)*2.5,0,1);
    const colorDiversity=clamp(1-Math.hypot(hueX,hueY)/Math.max(saturation*size,.001),0,1);
    const texture=clamp(edge*.50+Math.sqrt(textured/16)*.9+spatialContrast*.36,0,1);
    const density=clamp(edge*.55+texture*.32+contrast*.6,0,1);
    const openness=clamp(1-edge*.8-texture*.32,0,1);
    const motion=clamp(density*.64+contrast*.52+saturation*.18,0,1);
    return {hash,light,saturation,contrast,edge,texture,density,openness,motion,
      orientation,spatialContrast,colorDiversity,
      balance:clamp((right-left)/(size*.5),-1,1),highlights:bright/inner,
      r:red,g:green,b:blue,cells:Array.from(cells),gridTexture:Array.from(gridTexture)};
  }
  // 写真の特徴量をエンジンの発生頻度へ変換。高スコアを強めることで
  // 「この写真はこの世界に寄りやすい」という探索可能な偏りを作る。
  function engineWeights(f){
    const dark=1-f.light;
    const raw=[
      .20+2.4*f.openness+f.highlights*.6+f.light*.95,
      .18+9.0*f.edge+1.4*f.orientation+f.contrast*.7+f.spatialContrast*.35,
      (.24+2.8*dark+1.50*f.openness+f.spatialContrast*.35)*(1-f.edge*.73),
      .20+5.0*f.texture+2.5*f.edge*(1-f.orientation)+f.colorDiversity*1.25+f.saturation*.55+Math.max(0,f.edge-.32)*9.0
    ];
    return raw.map(x=>Math.pow(x,5.0));
  }
  function chooseEngine(f,mutation=0){
    const weights=engineWeights(f);
    const rng=new Random((f.hash^Math.imul(mutation+1,0x9e3779b9))>>>0);
    // MUTATEは写真の傾向を維持。約2割だけ他のエンジンも探りやすくする。
    if(mutation>0&&rng.chance(.20))for(let i=0;i<4;i++)weights[i]=Math.sqrt(weights[i]);
    let t=weights.reduce((a,b)=>a+b,0)*rng.next();
    for(let i=0;i<4;i++){t-=weights[i];if(t<=0)return i;}
    return 3;
  }
  function imageBpm(f,engine,seed){
    const ranges=[[56,88],[92,132],[40,72],[78,124]];
    const [min,max]=ranges[engine];
    const drive=clamp(.10+f.motion*.55+f.texture*.24+f.orientation*.13,0,1);
    // 撮影した風景が持つ固有のテンポに、再生成時だけわずかな差を持たせる。
    const r=new Random((f.hash^(seed>>>0)^0x71c48e21)>>>0);
    return Math.round(clamp(min+(max-min)*drive+(r.next()-.5)*6,min,max));
  }
  const midiToHz=m=>440*Math.pow(2,(m-69)/12);
  const scales=[[0,2,3,7,9],[0,2,5,7,10],[0,3,5,7,10],[0,2,4,7,9]];
  class SoundWorld {
    constructor(f,engine,seed){
      this.f=f;this.engine=engine;this.seed=seed>>>0;this.rng=new Random(seed);
      this.bpm=imageBpm(f,engine,seed);
      this.beat=60/this.bpm;
      this.duration=this.beat*32; // 8小節。エンジン別に異なる時間感覚。
      this.n=Math.ceil(this.duration*SR);
      this.left=new Float32Array(this.n);this.right=new Float32Array(this.n);
      this.root=36+Math.round(f.r*5+f.b*4+f.g*3+f.spatialContrast*3);
      this.scale=scales[(Math.floor((f.saturation*.65+f.colorDiversity*.35)*13)+((seed>>>6)%4))%4];
    }
    note(degree,octave=0){
      const len=this.scale.length;
      const ix=((degree%len)+len)%len;
      return midiToHz(this.root+this.scale[ix]+Math.floor(degree/len)*12+octave*12);
    }
    // 連続的な発音の入り/抜け。ノイズや硬いクリックを避ける。
    addTone(freq,at,dur,amp,kind='soft',pan=0,opts={}){
      const begin=Math.max(0,Math.floor(at*SR)),end=Math.min(this.n,Math.floor((at+dur)*SR));
      if(end<=begin)return;
      const attack=opts.attack??(kind==='pad'?.4:kind==='drone'?1.2:.008);
      const release=opts.release??(kind==='pad'?.75:kind==='drone'?1.4:.16);
      const wav=this.left,wr=this.right;
      const l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);
      const glide=opts.glide||0,mod=opts.mod||0;
      let phase=(opts.phase||0)*TAU;
      for(let i=begin;i<end;i++){
        const t=(i-begin)/SR,remaining=(end-i)/SR;
        const env=Math.pow(clamp(Math.min(t/attack,remaining/release,1),0,1),.77);
        const hz=freq*Math.pow(2,glide*t/12);
        phase+=TAU*hz/SR;
        let v;
        if(kind==='glass')v=.74*Math.sin(phase+Math.sin(phase*.39)*mod)+.24*Math.sin(phase*2.003)+.11*Math.sin(phase*3.994);
        else if(kind==='fm')v=.64*Math.sin(phase+(.65+mod)*Math.sin(phase*1.997))+.22*Math.sin(phase*.501);
        else if(kind==='bass')v=.85*Math.sin(phase)+.22*Math.sin(phase*2)+.06*Math.sin(phase*3);
        else if(kind==='drone')v=.65*Math.sin(phase)+.28*Math.sin(phase*1.009)+.12*Math.sin(phase*1.997+Math.sin(t*.16)*1.2);
        else if(kind==='ping')v=.85*Math.sin(phase)+.17*Math.sin(phase*3.01);
        else v=.73*Math.sin(phase)+.19*Math.sin(phase*2.001)+.08*Math.sin(phase*3.007);
        const pulsate=1+Math.sin(t*.3+mod)*(.05+mod*.045);
        const sample=v*amp*env*pulsate;
        wav[i]+=sample*l;wr[i]+=sample*r;
      }
    }
    addNoise(at,dur,amp,kind='air',pan=0){
      const rng=this.rng;const a=Math.max(0,Math.floor(at*SR));const b=Math.min(this.n,Math.ceil((at+dur)*SR));
      const l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);
      let low=0,low2=0;
      for(let i=a;i<b;i++){
        const t=(i-a)/SR; const end=(b-i)/SR;
        const env=clamp(Math.min(t/(kind==='air'?.4:.002),end/(kind==='air'?.5:.035),1),0,1);
        const white=rng.range(-1,1);
        low=low*.97+white*.03;low2=low2*.995+white*.005;
        let s=kind==='air'?(low-low2)*2.5:kind==='hat'?(white-low*.8)*.55:low*1.9;
        s*=amp*env;
        this.left[i]+=s*l;this.right[i]+=s*r;
      }
    }
    // 低域のキックを共通ドラムとして常時追加しない。PULSEだけの要素。
    kick(at,amp=.17){
      const begin=Math.floor(at*SR),dur=.32;let phase=0;
      for(let j=0;j<dur*SR&&begin+j<this.n;j++){
        const t=j/SR;
        phase+=TAU*(49+94*Math.exp(-t*19))/SR;
        const env=Math.exp(-t*14)*Math.min(1,t*130);
        const sample=Math.sin(phase)*amp*env;
        this.left[begin+j]+=sample*.72;this.right[begin+j]+=sample*.72;
      }
    }
    veil(){
      const r=this.rng,b=this.beat,f=this.f;
      // 長い和音の遷移が主役。短い音は時折現れるだけ。
      for(let bar=0;bar<8;bar+=2){
        const degree=[0,2,3,1][(bar/2+this.seed%2)%4];
        for(const [off,oct,vol] of [[0,0,.086],[2,1,.060],[4,1,.035]]){
          this.addTone(this.note(degree+off,oct),bar*4*b,8.0*b,.8*vol,'pad',r.range(-.56,.56),{attack:b*1.15,release:b*1.5,mod:f.saturation});
        }
      }
      for(let k=0;k<26;k++){
        if(!r.chance(.35+f.highlights*.4+f.texture*.18))continue;
        const at=r.range(.2,this.duration-1.0),d=r.pick([2,3,4,7]);
        this.addTone(this.note(d,2),at,r.range(.3,.88),r.range(.014,.043),'glass',r.range(-.8,.8),{attack:.025,release:.25,mod:.4});
      }
      for(let k=0;k<12;k++)this.addNoise(k*this.duration/12,this.duration/12*1.2,.035,'air',r.range(-.7,.7));
    }
    pulse(){
      const r=this.rng,b=this.beat,f=this.f;
      const phrase=[0,2,0,3,1,2,4,1];
      for(let beat=0;beat<32;beat++){
        const t=beat*b;
        if(beat%4===0||beat%4===2&&r.chance(.25+f.cells[beat%16]*.42))this.kick(t,.14+r.range(-.025,.025));
        if(beat%4===1||beat%4===3&&r.chance(.7))this.addNoise(t,.10,.076,'hat',r.range(-.2,.2));
        if(r.chance(.12+f.texture*.5+f.gridTexture[beat%16]*.24))this.addNoise(t+b*.52,.044,.047,'hat',r.range(-.9,.9));
        // ピッチを持った反復リフがクリック群をまとめる。
        const pos=beat%8;
        if(pos!==3&&r.chance(.58+f.cells[(beat+7)%16]*.35)){
          this.addTone(this.note(phrase[pos],0),t+.013,b*r.range(.35,.72),r.range(.08,.125),'fm',r.range(-.4,.4),{release:.13,mod:.45});
        }
        if(pos===7&&r.chance(.7))this.addTone(this.note(4,2),t+b*.66,b*.25,.035,'ping',r.range(-1,1),{release:.055});
      }
      // 4小節ごとに同じフレーズを少し違わせ、単調なクリックを回避。
      for(let bar=0;bar<8;bar+=2){
        this.addTone(this.note(bar%4?2:0,-1),bar*4*b,5*b,.038,'drone',-.15,{attack:b*.4,release:b*.65});
      }
    }
    current(){
      const r=this.rng,b=this.beat,f=this.f;
      for(let bar=0;bar<8;bar+=2){
        const deg=(bar/2)%3===0?0:(bar/2)%3===1?2:1;
        const start=bar*4*b;
        this.addTone(this.note(deg,-1),start,8*b,.13,'drone',r.range(-.23,.23),{attack:b,release:b*1.5,mod:f.contrast});
        this.addTone(this.note(deg+2,0),start+.13,7.8*b,.065,'drone',r.range(-.7,.7),{attack:b*1.4,release:b*1.4,mod:.1});
        this.addTone(this.note(deg+4,1),start+.4,6.5*b,.035,'soft',r.range(-.6,.6),{attack:b*2,release:b*1.5});
      }
      for(let i=0;i<14;i++){
        const t=i*this.duration/14;
        this.addNoise(t,this.duration/14*1.6,.035+f.edge*.025,'air',Math.sin(i*.9)*.6);
      }
      for(let k=0;k<8;k++){
        const t=r.range(0,this.duration-.9);
        this.addTone(this.note(r.pick([0,2,4]),2),t,r.range(.6,1.4),r.range(.025,.041),'glass',r.range(-.8,.8),{attack:.09,release:.55});
      }
    }
    particle(){
      const r=this.rng,b=this.beat,f=this.f;
      // 粒の配置には確率だけでなく、繰り返すモチーフを与える。
      const motif=[0,4,2,1,5,3,2,6];
      for(let bar=0;bar<8;bar++){
        const offset=bar*4*b;
        for(let ix=0;ix<16;ix++){
          if(!r.chance(.23+f.texture*.44+f.gridTexture[ix%16]*.24))continue;
          const at=offset+ix*b*.25+r.range(-.025,.028);
          const d=motif[ix%motif.length];
          this.addTone(this.note(d,1+r.pick([0,1])),at,r.range(.055,.30),r.range(.035,.095),'glass',r.range(-1,1),{attack:.002,release:.055,glide:r.range(-2,2),mod:r.range(.1,.8)});
          if(ix%5===0&&r.chance(.48))this.addNoise(at,.05,.029,'hat',r.range(-1,1));
        }
        if(bar%2===0)this.addTone(this.note(bar%3,0),offset+2*b,b*1.15,.085,'fm',r.range(-.75,.75),{attack:.18,release:.35,mod:1.0});
      }
      // 単なる短いノイズの羅列にしないため、背後に遅い音の輪郭を置く。
      for(let i=0;i<4;i++)this.addTone(this.note([0,2,1,3][i],0),i*this.duration/4,this.duration/3,.035,'pad',r.range(-.8,.8),{attack:.9,release:1.2});
    }
    finish(){
      const l=this.left,r=this.right,n=this.n;
      // サブソニック成分だけを除去し、ドローンの低域は残す。
      let prevL=0,prevR=0,yL=0,yR=0,peak=0,sum=0;
      for(let i=0;i<n;i++){
        const xL=l[i],xR=r[i];yL=.992*(yL+xL-prevL);yR=.992*(yR+xR-prevR);
        prevL=xL;prevR=xR;l[i]=yL;r[i]=yR;
        peak=Math.max(peak,Math.abs(yL),Math.abs(yR));sum+=yL*yL+yR*yR;
      }
      const rms=Math.sqrt(sum/(2*n));
      const target=[.092,.12,.093,.11][this.engine];
      const gain=Math.min(2.9,target/Math.max(rms,.00001),.72/Math.max(peak,.00001));
      for(let i=0;i<n;i++){
        l[i]=Math.tanh(l[i]*gain*1.05)*.91;r[i]=Math.tanh(r[i]*gain*1.05)*.91;
      }
      // 繋ぎ目は約120msの短いフェードで両端をゼロに収束させる。
      // 先頭と末尾の別時刻を混合すると、境界で大きな段差が残るため避ける。
      const cross=Math.min(Math.floor(SR*.12),Math.floor(n/16));
      for(let j=0;j<cross;j++){
        const fade=.5-.5*Math.cos(Math.PI*j/cross);
        const end=n-1-j;
        l[j]*=fade;r[j]*=fade;
        l[end]*=fade;r[end]*=fade;
      }
      // 映像アニメーションと共有する短周期の音量包絡。
      const step=Math.max(1,Math.floor(SR/16));
      const envelope=new Float32Array(Math.ceil(n/step));
      let mx=0;
      for(let k=0;k<envelope.length;k++){
        let e=0,c=0;for(let j=k*step;j<Math.min(n,(k+1)*step);j++){e+=l[j]*l[j]+r[j]*r[j];c+=2;}
        envelope[k]=Math.sqrt(e/Math.max(c,1));mx=Math.max(mx,envelope[k]);
      }
      for(let k=0;k<envelope.length;k++)envelope[k]=clamp(envelope[k]/Math.max(.0001,mx)*.8,0,1);
      return {sampleRate:SR,length:n,duration:this.duration,bpm:Math.round(this.bpm),engine:this.engine,
        name:ENGINES[this.engine],left:l,right:r,envelope,seed:this.seed};
    }
  }
  function synthesize(features,engine,seed){
    const w=new SoundWorld(features,engine,seed);
    if(engine===0)w.veil();else if(engine===1)w.pulse();else if(engine===2)w.current();else w.particle();
    return w.finish();
  }
  function makeBuffer(ctx,data){
    const b=ctx.createBuffer(2,data.length,data.sampleRate);
    b.copyToChannel(data.left,0);b.copyToChannel(data.right,1);
    return b;
  }
  function encodeWav(data){
    const n=data.length;
    const arr=new ArrayBuffer(44+n*4),v=new DataView(arr);
    const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
    str(0,'RIFF');v.setUint32(4,36+n*4,true);str(8,'WAVE');str(12,'fmt ');
    v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
    v.setUint32(24,data.sampleRate,true);v.setUint32(28,data.sampleRate*4,true);
    v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*4,true);
    for(let i=0;i<n;i++){
      v.setInt16(44+i*4,Math.round(clamp(data.left[i],-1,1)*32767),true);
      v.setInt16(46+i*4,Math.round(clamp(data.right[i],-1,1)*32767),true);
    }
    return new Blob([arr],{type:'audio/wav'});
  }
  root.NWAudio={analyzeImage,engineWeights,chooseEngine,imageBpm,synthesize,makeBuffer,encodeWav,ENGINES};
})(window);
