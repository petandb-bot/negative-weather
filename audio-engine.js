(function(root){
  'use strict';
  const SR = 22050;
  const TAU = Math.PI * 2;
  const ENGINES = ['VEIL','PULSE','CURRENT','PARTICLE'];
  const VARIANTS = {
    VEIL:['AERIAL BLOOM','METAL GLASS','TAPE GLOW'],
    PULSE:['DRY GRID','FM STEP','LOW CIRCUIT'],
    CURRENT:['HUM FIELD','BELL DRIFT','LOW TIDE'],
    PARTICLE:['DUST RAIN','BROKEN TOYS','GRAIN LOOP']
  };
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const mix=(a,b,t)=>a+(b-a)*t;
  class Random {
    constructor(seed){ this.x=(seed>>>0)||1234567; }
    next(){ let x=this.x; x^=x<<13; x^=x>>>17; x^=x<<5; this.x=x>>>0; return (this.x>>>0)/4294967296; }
    range(a,b){ return a + (b-a)*this.next(); }
    pick(arr){ return arr[Math.floor(this.next()*arr.length)] || arr[0]; }
    chance(v){ return this.next()<v; }
  }
  function hslFromRgb(r,g,b){
    const max=Math.max(r,g,b), min=Math.min(r,g,b); let h=0,s=0,l=(max+min)/2;
    const d=max-min;
    if(d>1e-5){
      s=l>0.5 ? d/(2-max-min) : d/(max+min);
      switch(max){
        case r: h=((g-b)/d+(g<b?6:0))/6; break;
        case g: h=((b-r)/d+2)/6; break;
        default: h=((r-g)/d+4)/6; break;
      }
    }
    return [h,s,l];
  }
  function analyzeImage(img){
    const S=160, c=document.createElement('canvas'); c.width=c.height=S;
    const ctx=c.getContext('2d',{willReadFrequently:true});
    const scale=Math.max(S/img.width,S/img.height);
    ctx.drawImage(img,(S-img.width*scale)/2,(S-img.height*scale)/2,img.width*scale,img.height*scale);
    const p=ctx.getImageData(0,0,S,S).data;
    const lum=new Float32Array(S*S), cells=new Float32Array(16), edgeCells=new Float32Array(16), satCells=new Float32Array(16), hueCells=new Float32Array(16);
    let hash=2166136261>>>0, light=0, saturation=0, hueX=0, hueY=0, warm=0, cool=0, red=0, green=0, blue=0;
    let left=0,right=0,top=0,bottom=0;
    for(let y=0;y<S;y++)for(let x=0;x<S;x++){
      const i=y*S+x,k=i*4,r=p[k]/255,g=p[k+1]/255,b=p[k+2]/255;
      const l=.2126*r+.7152*g+.0722*b; lum[i]=l; light+=l; red+=r; green+=g; blue+=b;
      const [h,s] = hslFromRgb(r,g,b); saturation+=s; hueX+=Math.cos(h*TAU)*s; hueY+=Math.sin(h*TAU)*s;
      if(x<S/2)left+=l; else right+=l; if(y<S/2)top+=l; else bottom+=l;
      warm += Math.max(0,r-b); cool += Math.max(0,b-r);
      const ci=(Math.floor(y/40))*4+Math.floor(x/40); cells[ci]+=l; satCells[ci]+=s; hueCells[ci]+=h;
      if(i%11===0){ hash^=((p[k]*3 + p[k+1]*5 + p[k+2]*7 + Math.floor(l*255)) & 255); hash=Math.imul(hash,16777619)>>>0; }
    }
    const size=S*S; light/=size; saturation/=size; red/=size; green/=size; blue/=size; warm/=size; cool/=size;
    for(let i=0;i<16;i++){ cells[i]/=1600; satCells[i]/=1600; hueCells[i]/=1600; }
    let variance=0,e=0,ex=0,ey=0,bright=0,blockVar=0;
    for(let y=1;y<S-1;y++)for(let x=1;x<S-1;x++){
      const i=y*S+x,dx=Math.abs(lum[i+1]-lum[i-1])*.5,dy=Math.abs(lum[i+S]-lum[i-S])*.5;
      const local=dx+dy; variance+=(lum[i]-light)**2; e+=local; ex+=dx; ey+=dy; if(lum[i]>.82)bright++;
      edgeCells[(Math.floor(y/40))*4+Math.floor(x/40)] += local;
    }
    const inner=(S-2)*(S-2), contrast=Math.sqrt(variance/inner);
    for(let i=0;i<16;i++){ edgeCells[i]=clamp(edgeCells[i]/1550*3,0,1); blockVar+=(cells[i]-light)**2; }
    const edge=clamp(e/inner*2.5,0,1);
    const orientation=clamp(Math.abs(ex-ey)/Math.max(ex+ey,.001),0,1);
    const spatialContrast=clamp(Math.sqrt(blockVar/16)*2.5,0,1);
    const colorDiversity=clamp(1-Math.hypot(hueX,hueY)/Math.max(saturation*size,.001),0,1);
    const texture=clamp(edge*.45+spatialContrast*.45+colorDiversity*.15+saturation*.25,0,1);
    const openness=clamp(1-edge*.8-texture*.35,0,1);
    const motion=clamp(contrast*.55+texture*.42+edge*.30+saturation*.12,0,1);
    const hue=(Math.atan2(hueY,hueX)/TAU + 1) % 1;
    const horizontalBias=clamp((right-left)/(size*.5),-1,1), verticalBias=clamp((bottom-top)/(size*.5),-1,1);
    const palette=[
      [red,green,blue],
      [clamp(red*.7+0.15,0,1),clamp(blue*.6+green*.2+0.15,0,1),clamp(blue*.9+0.05,0,1)],
      [clamp(0.35+warm*0.9,0,1),clamp(0.25+green*0.5,0,1),clamp(0.2+cool*0.8,0,1)]
    ];
    return { hash,light,saturation,contrast,edge,texture,openness,motion,orientation,spatialContrast,colorDiversity,hue,warm,cool,
      r:red,g:green,b:blue,balance:horizontalBias,verticalBias,highlights:bright/inner,cells:Array.from(cells),edgeCells:Array.from(edgeCells),satCells:Array.from(satCells),hueCells:Array.from(hueCells),palette };
  }
  function engineWeights(f){
    const dark=1-f.light;
    const raw=[
      .18 + 2.5*f.openness + 1.2*f.highlights + .7*(1-f.edge) + .6*f.colorDiversity,
      .18 + 3.9*f.edge + 1.4*f.orientation + .9*f.contrast + .7*f.satCells.reduce((a,b)=>a+b,0)/16,
      .20 + 3.2*dark + 1.8*(1-f.edge) + .8*f.spatialContrast + .4*Math.abs(f.verticalBias),
      .20 + 3.5*f.texture + 1.4*f.colorDiversity + .8*f.saturation + 1.1*(1-f.openness)
    ];
    return raw.map(x=>Math.pow(x,4.6));
  }
  function chooseEngine(f,mutation=0){
    const weights=engineWeights(f).slice();
    const rng=new Random((f.hash^Math.imul(mutation+1,0x9e3779b9))>>>0);
    if(mutation>0 && rng.chance(.28)) for(let i=0;i<4;i++) weights[i]=Math.sqrt(weights[i]);
    let t=weights.reduce((a,b)=>a+b,0)*rng.next();
    for(let i=0;i<4;i++){ t-=weights[i]; if(t<=0) return i; }
    return 3;
  }
  function imageBpm(f,engine,seed){
    const ranges=[[54,86],[88,136],[40,72],[76,128]][engine];
    let drive;
    if(engine===0) drive=clamp(.12 + f.saturation*.15 + (1-f.edge)*.5 + f.light*.12 + f.colorDiversity*.2,0,1);
    else if(engine===1) drive=clamp(.15 + f.edge*.42 + f.texture*.22 + f.orientation*.12 + f.satCells.reduce((a,b)=>a+b,0)/16*.1,0,1);
    else if(engine===2) drive=clamp(.10 + (1-f.light)*.4 + (1-f.edge)*.32 + f.spatialContrast*.1,0,1);
    else drive=clamp(.14 + f.texture*.38 + f.colorDiversity*.16 + f.edge*.16,0,1);
    const r=new Random((f.hash^seed^0x71c48e21)>>>0);
    return Math.round(clamp(mix(ranges[0],ranges[1],drive)+(r.next()-.5)*8,ranges[0],ranges[1]));
  }
  const scales=[[0,2,3,7,9],[0,2,5,7,10],[0,3,5,7,10],[0,2,4,7,9],[0,1,5,7,8]];
  const midiToHz=m=>440*Math.pow(2,(m-69)/12);
  class SoundWorld {
    constructor(f,engine,seed){
      this.f=f; this.engine=engine; this.seed=seed>>>0; this.rng=new Random(this.seed);
      this.variant=this.chooseVariant();
      this.name=ENGINES[this.engine]; this.variantName=VARIANTS[this.name][this.variant];
      this.bpm=imageBpm(f,engine,seed); this.beat=60/this.bpm;
      this.duration=this.engine===2 ? this.beat*28 : this.beat*32;
      this.n=Math.ceil(this.duration*SR);
      this.left=new Float32Array(this.n); this.right=new Float32Array(this.n);
      this.root=36+Math.round(f.r*4+f.b*5+f.g*3+f.spatialContrast*3+f.hue*5);
      this.scale=scales[(Math.floor((f.saturation*.55+f.colorDiversity*.45)*17)+((seed>>>4)%scales.length))%scales.length];
      this.events=[];
    }
    chooseVariant(){
      const f=this.f, s=(this.seed>>>0);
      if(this.engine===0){
        if(f.hue>.55 && f.cool>f.warm) return 1;
        if(f.light>.56 && f.openness>.45) return 0;
        return (2 + (s%2)) % 3;
      }else if(this.engine===1){
        if(f.orientation>.35 && f.edge>.35) return 0;
        if(f.saturation>.34 && f.colorDiversity>.46) return 1;
        return 2;
      }else if(this.engine===2){
        if(f.light<.32 && f.spatialContrast>.22) return 0;
        if(f.highlights>.12 || f.cool>f.warm) return 1;
        return 2;
      }else{
        if(f.texture>.56 && f.edge>.32) return 0;
        if(f.colorDiversity>.50 || f.saturation>.38) return 1;
        return 2;
      }
    }
    note(degree,oct=0){
      const len=this.scale.length, ix=((degree%len)+len)%len;
      return midiToHz(this.root+this.scale[ix]+Math.floor(degree/len)*12+oct*12);
    }
    addEvent(time,low=0,mid=0,high=0,accent=0){ this.events.push({time,low,mid,high,accent}); }
    addTone(freq,at,dur,amp,kind='soft',pan=0,opts={}){
      const begin=Math.max(0,Math.floor(at*SR)), end=Math.min(this.n,Math.floor((at+dur)*SR)); if(end<=begin) return;
      const attack=opts.attack ?? (kind==='pad'?0.4:kind==='drone'?1.2:0.006);
      const release=opts.release ?? (kind==='pad'?0.75:kind==='drone'?1.4:0.14);
      const l=Math.sqrt((1-pan)/2), r=Math.sqrt((1+pan)/2); let phase=(opts.phase||0)*TAU;
      const glide=opts.glide||0, mod=opts.mod||0;
      const bands = opts.bands || (kind==='bass'?[1,.15,.03]:kind==='drone'?[.75,.35,.18]:kind==='glass'?[.05,.35,.85]:kind==='ping'?[.10,.35,.9]:[.12,.65,.48]);
      this.addEvent(at,bands[0]*amp*4,bands[1]*amp*4,bands[2]*amp*4,(bands[0]+bands[1]+bands[2])*amp*2);
      for(let i=begin;i<end;i++){
        const t=(i-begin)/SR, rem=(end-i)/SR;
        const env=Math.pow(clamp(Math.min(t/attack,rem/release,1),0,1),.78);
        const hz=freq*Math.pow(2,glide*t/12); phase+=TAU*hz/SR;
        let v;
        if(kind==='glass') v=.74*Math.sin(phase+Math.sin(phase*.39)*mod)+.22*Math.sin(phase*2.003)+.10*Math.sin(phase*3.994);
        else if(kind==='fm') v=.67*Math.sin(phase+(.45+mod)*Math.sin(phase*1.997))+.22*Math.sin(phase*.501)+.10*Math.sin(phase*2.52);
        else if(kind==='bass') v=.86*Math.sin(phase)+.24*Math.sin(phase*2)+.08*Math.sin(phase*3);
        else if(kind==='drone') v=.62*Math.sin(phase)+.31*Math.sin(phase*1.009)+.12*Math.sin(phase*1.997+Math.sin(t*.19+mod)*1.3);
        else if(kind==='saw') { const p=(phase/TAU)%1; v=(p*2-1)*0.6 + Math.sin(phase)*0.25 + Math.sin(phase*2)*0.1; }
        else if(kind==='pulse') v=(Math.sin(phase)>0?0.82:-0.82)*.42 + Math.sin(phase)*.25;
        else if(kind==='ping') v=.85*Math.sin(phase)+.18*Math.sin(phase*3.01);
        else if(kind==='soft') v=.72*Math.sin(phase)+.18*Math.sin(phase*2.001)+.08*Math.sin(phase*3.007);
        else v=Math.sin(phase);
        const wobble=1+Math.sin(t*.3+mod)*(.05+mod*.04);
        const sample=v*amp*env*wobble; this.left[i]+=sample*l; this.right[i]+=sample*r;
      }
    }
    addNoise(at,dur,amp,kind='air',pan=0){
      const a=Math.max(0,Math.floor(at*SR)), b=Math.min(this.n,Math.ceil((at+dur)*SR));
      const l=Math.sqrt((1-pan)/2), r=Math.sqrt((1+pan)/2); let low=0, low2=0;
      this.addEvent(at, kind==='thump'?amp*2:amp*.3, amp*1.1, kind==='air'?amp*.8:amp*1.4, amp*.8);
      for(let i=a;i<b;i++){
        const t=(i-a)/SR, rem=(b-i)/SR, env=clamp(Math.min(t/(kind==='air'?.4:.002), rem/(kind==='air'?.5:.035), 1),0,1);
        const white=this.rng.range(-1,1); low=low*.97+white*.03; low2=low2*.995+white*.005;
        let s=kind==='air'?(low-low2)*2.5 : kind==='hat'?(white-low*.8)*.55 : kind==='thump'?low*1.9 : (white*0.5+low*0.3);
        s*=amp*env; this.left[i]+=s*l; this.right[i]+=s*r;
      }
    }
    kick(at,amp=.17){
      const begin=Math.floor(at*SR), dur=.32; let phase=0; this.addEvent(at,amp*2.6,amp*.7,amp*.1,amp*1.4);
      for(let j=0;j<dur*SR&&begin+j<this.n;j++){
        const t=j/SR; phase+=TAU*(49+94*Math.exp(-t*19))/SR;
        const env=Math.exp(-t*14)*Math.min(1,t*130), s=Math.sin(phase)*amp*env;
        this.left[begin+j]+=s*.72; this.right[begin+j]+=s*.72;
      }
    }
    cellStep(i){ const c=this.f.cells[i%16], e=this.f.edgeCells[i%16], s=this.f.satCells[i%16]; return {c,e,s}; }
    veil(){
      const r=this.rng,b=this.beat,f=this.f, v=this.variant;
      const chords = v===0 ? [0,2,4,1] : v===1 ? [0,3,1,4] : [0,2,1,3];
      for(let bar=0; bar<8; bar+=2){
        const degree=chords[(bar/2)%chords.length], start=bar*4*b;
        const kind = v===1 ? 'glass' : v===2 ? 'soft' : 'pad';
        for(const [off,oct,vol] of [[0,0,.084],[2,1,.058],[4,1,.032]]){
          this.addTone(this.note(degree+off,oct),start,8*b,.8*vol,kind,r.range(-.55,.55),{attack:b*(v===2?0.6:1.1),release:b*(v===1?1.0:1.5),mod:f.saturation,bands:v===1?[.08,.28,.85]:[.12,.45,.36]});
        }
      }
      const n=20+Math.floor(f.highlights*20);
      for(let k=0;k<n;k++){
        if(!r.chance(.28+f.highlights*.35+f.texture*.2)) continue;
        const at=r.range(.2,this.duration-.8), d=r.pick([2,3,4,7]), pan=r.range(-.9,.9), oct=v===1?2:(v===2?1:2);
        const kind=v===2?'soft':'glass';
        this.addTone(this.note(d,oct),at,r.range(.22,.9),r.range(.012,.038),kind,pan,{attack:.02,release:v===1?.4:.28,mod:f.colorDiversity,bands:kind==='glass'?[.04,.32,.88]:[.06,.38,.55]});
      }
      if(v===2){
        for(let i=0;i<8;i++) this.addNoise(i*this.duration/8,this.duration/8*1.3,.028,'air',Math.sin(i*.7));
      }
    }
    pulse(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const motif = Array.from({length:16},(_,i)=>Math.floor((f.cells[i]*7 + f.edgeCells[i]*10 + f.satCells[i]*5))%6);
      for(let step=0; step<32; step++){
        const t=step*b; const {c,e,s}=this.cellStep(step);
        const density=.2 + e*.65 + c*.15;
        if(step%4===0 || (step%4===2 && r.chance(.2+e*.45))) this.kick(t, .12 + c*.04 + (v===2?0.04:0));
        if(v!==2 && (step%4===1 || step%4===3) && r.chance(.55+s*.5)) this.addNoise(t,.08,.05+.03*s,'hat',r.range(-.3,.3));
        if(v===0){
          if(r.chance(.45+density*.35)) this.addTone(this.note(motif[step%16],0),t+.01,b*r.range(.32,.62),.075+.02*c,'pulse',r.range(-.4,.4),{release:.10,mod:.22+s,bands:[.18,.70,.18]});
        }else if(v===1){
          if(r.chance(.35+density*.35)) this.addTone(this.note(motif[step%16],0),t+.01,b*r.range(.30,.65),.07+.02*c,'fm',r.range(-.6,.6),{release:.12,mod:.5+f.colorDiversity,bands:[.12,.55,.42]});
          if(step%8===7 && r.chance(.7)) this.addTone(this.note(motif[(step+3)%16],2),t+b*.7,b*.22,.028,'ping',r.range(-1,1),{release:.05,bands:[.04,.22,.85]});
        }else{
          if(r.chance(.42+density*.38)) this.addTone(this.note(motif[step%16],-1),t,b*.26,.06+.03*c,'bass',r.range(-.18,.18),{release:.14,bands:[.92,.18,.02]});
          if(step%2===1 && r.chance(.55+s*.2)) this.addTone(this.note(motif[(step+5)%16],1),t+b*.52,b*.18,.035,'saw',r.range(-.5,.5),{release:.08,bands:[.12,.52,.35]});
          if(step%4===1 && r.chance(.45)) this.addNoise(t+b*.48,.04,.03,'hat',r.range(-.8,.8));
        }
      }
      if(v===2){ for(let bar=0; bar<8; bar+=2) this.addTone(this.note(bar%4?2:0,-1),bar*4*b,5*b,.032,'drone',-.12,{attack:b*.4,release:b*.65,bands:[.68,.22,.05]}); }
    }
    current(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const progression=v===1?[0,3,1,4]:v===2?[0,2,0,1]:[0,2,1,3];
      for(let bar=0; bar<7; bar+=2){
        const deg=progression[(bar/2)%progression.length], start=bar*4*b;
        if(v===0){
          this.addTone(this.note(deg,-1),start,8*b,.14,'drone',r.range(-.25,.25),{attack:b,release:b*1.6,mod:f.contrast,bands:[.82,.26,.08]});
          this.addTone(this.note(deg+2,0),start+.2,7.4*b,.06,'drone',r.range(-.6,.6),{attack:b*1.4,release:b*1.5,mod:.2,bands:[.34,.46,.16]});
        }else if(v===1){
          this.addTone(this.note(deg,-1),start,7.5*b,.1,'drone',r.range(-.3,.3),{attack:b*1.2,release:b*1.3,mod:f.cool,bands:[.65,.24,.14]});
          for(let i=0;i<3;i++) this.addTone(this.note(deg+2+i,1),start+r.range(.2,3.1*b),r.range(.8,2.2),.028,'glass',r.range(-.8,.8),{attack:.03,release:.5,bands:[.05,.24,.88]});
        }else{
          this.addTone(this.note(deg,-1),start,8*b,.13,'bass',0,{attack:b*.8,release:b*1.6,bands:[.92,.22,.05]});
          this.addTone(this.note(deg+4,0),start+.45,6*b,.04,'soft',r.range(-.55,.55),{attack:b*.7,release:b,bands:[.20,.42,.30]});
        }
      }
      for(let i=0;i<10;i++) this.addNoise(i*this.duration/10,this.duration/10*1.5,.03+f.edge*.02,'air',Math.sin(i*.9)*.7);
    }
    particle(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const motif=Array.from({length:16},(_,i)=>Math.floor((f.edgeCells[i]*11 + f.hueCells[i]*7 + f.satCells[i]*5))%7);
      for(let bar=0; bar<8; bar++){
        const offset=bar*4*b;
        for(let ix=0; ix<16; ix++){
          const c=f.cells[ix], e=f.edgeCells[ix], s=f.satCells[ix];
          if(!r.chance(.15 + e*.45 + f.texture*.22 + (v===0?c*.1:s*.1))) continue;
          const at=offset+ix*b*.25+r.range(-.02,.03), d=motif[ix%16], pan=r.range(-1,1);
          if(v===0){
            this.addTone(this.note(d,1+r.pick([0,1])),at,r.range(.05,.22),r.range(.03,.085),'glass',pan,{attack:.002,release:.05,glide:r.range(-2,2),mod:r.range(.1,.8),bands:[.06,.22,.9]});
          }else if(v===1){
            this.addTone(this.note(d,0+r.pick([0,1])),at,r.range(.04,.18),r.range(.025,.07),'fm',pan,{attack:.002,release:.05,glide:r.range(-4,4),mod:r.range(.2,1),bands:[.08,.44,.55]});
            if(ix%5===0&&r.chance(.42)) this.addNoise(at,.04,.028,'hat',pan);
          }else{
            this.addTone(this.note(d,-1+r.pick([1,2])),at,r.range(.06,.24),r.range(.03,.08),'soft',pan,{attack:.005,release:.08,glide:r.range(-1,1),bands:[.15,.52,.45]});
            if(ix%6===0) this.addTone(this.note((d+2)%7,2),at+r.range(.03,.1),r.range(.08,.28),.02,'ping',-pan,{release:.09,bands:[.05,.15,.85]});
          }
        }
        if(bar%2===0 && v!==0) this.addTone(this.note(bar%3,0),offset+2*b,b*1.05,.055,'pad',r.range(-.7,.7),{attack:.18,release:.38,bands:[.12,.35,.35]});
      }
      for(let i=0;i<4;i++) this.addTone(this.note([0,2,1,3][i],0),i*this.duration/4,this.duration/3,.03,'pad',r.range(-.8,.8),{attack:.9,release:1.2,bands:[.10,.30,.34]});
    }
    finish(){
      const l=this.left, r=this.right, n=this.n; let prevL=0,prevR=0,yL=0,yR=0,peak=0,sum=0;
      for(let i=0;i<n;i++){
        const xL=l[i], xR=r[i]; yL=.992*(yL+xL-prevL); yR=.992*(yR+xR-prevR); prevL=xL; prevR=xR; l[i]=yL; r[i]=yR;
        peak=Math.max(peak,Math.abs(yL),Math.abs(yR)); sum+=yL*yL+yR*yR;
      }
      const rms=Math.sqrt(sum/(2*n)); const targets=[.094,.118,.093,.108], target=targets[this.engine];
      const gain=Math.min(2.8,target/Math.max(rms,1e-5),.72/Math.max(peak,1e-5));
      for(let i=0;i<n;i++){ l[i]=Math.tanh(l[i]*gain*1.04)*.92; r[i]=Math.tanh(r[i]*gain*1.04)*.92; }
      const cross=Math.min(Math.floor(SR*.12),Math.floor(n/16));
      for(let j=0;j<cross;j++){ const fade=.5-.5*Math.cos(Math.PI*j/cross), end=n-1-j; l[j]*=fade; r[j]*=fade; l[end]*=fade; r[end]*=fade; }
      const step=Math.max(1,Math.floor(SR/16)), bins=Math.ceil(n/step);
      const envelope=new Float32Array(bins), low=new Float32Array(bins), mid=new Float32Array(bins), high=new Float32Array(bins), hit=new Float32Array(bins);
      let mx=0, lmx=0, mmx=0, hmx=0, amx=0;
      for(let k=0;k<bins;k++){
        let e=0,c=0; for(let j=k*step;j<Math.min(n,(k+1)*step);j++){ e+=l[j]*l[j]+r[j]*r[j]; c+=2; }
        envelope[k]=Math.sqrt(e/Math.max(c,1)); mx=Math.max(mx,envelope[k]);
      }
      for(const ev of this.events){
        const idx=clamp(Math.floor(ev.time/this.duration*bins),0,bins-1); low[idx]+=ev.low||0; mid[idx]+=ev.mid||0; high[idx]+=ev.high||0; hit[idx]+=ev.accent||0;
        if(idx+1<bins){ low[idx+1]+=(ev.low||0)*0.45; mid[idx+1]+=(ev.mid||0)*0.35; high[idx+1]+=(ev.high||0)*0.28; }
      }
      for(let i=0;i<bins;i++){ lmx=Math.max(lmx,low[i]); mmx=Math.max(mmx,mid[i]); hmx=Math.max(hmx,high[i]); amx=Math.max(amx,hit[i]); }
      for(let i=0;i<bins;i++){
        envelope[i]=clamp(envelope[i]/Math.max(mx,.0001)*.9,0,1);
        low[i]=clamp(low[i]/Math.max(lmx,.0001),0,1); mid[i]=clamp(mid[i]/Math.max(mmx,.0001),0,1); high[i]=clamp(high[i]/Math.max(hmx,.0001),0,1); hit[i]=clamp(hit[i]/Math.max(amx,.0001),0,1);
      }
      return { sampleRate:SR,length:n,duration:this.duration,bpm:Math.round(this.bpm),engine:this.engine,name:this.name,variant:this.variantName,left:l,right:r,envelope,low,mid,high,hit,seed:this.seed };
    }
  }
  function synthesize(features,engine,seed){
    const w=new SoundWorld(features,engine,seed);
    if(engine===0) w.veil(); else if(engine===1) w.pulse(); else if(engine===2) w.current(); else w.particle();
    return w.finish();
  }
  function makeBuffer(ctx,data){ const b=ctx.createBuffer(2,data.length,data.sampleRate); b.copyToChannel(data.left,0); b.copyToChannel(data.right,1); return b; }
  function encodeWav(data){
    const n=data.length, arr=new ArrayBuffer(44+n*4), v=new DataView(arr); const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
    str(0,'RIFF'); v.setUint32(4,36+n*4,true); str(8,'WAVE'); str(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,2,true);
    v.setUint32(24,data.sampleRate,true); v.setUint32(28,data.sampleRate*4,true); v.setUint16(32,4,true); v.setUint16(34,16,true); str(36,'data'); v.setUint32(40,n*4,true);
    for(let i=0;i<n;i++){ v.setInt16(44+i*4,Math.round(clamp(data.left[i],-1,1)*32767),true); v.setInt16(46+i*4,Math.round(clamp(data.right[i],-1,1)*32767),true); }
    return new Blob([arr],{type:'audio/wav'});
  }
  root.NWAudio={analyzeImage,engineWeights,chooseEngine,imageBpm,synthesize,makeBuffer,encodeWav,ENGINES,VARIANTS};
})(window);
