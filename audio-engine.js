(function(root){
  'use strict';
  const SR = 22050;
  const TAU = Math.PI * 2;
  const ENGINES = ['VEIL','PULSE','CURRENT','PARTICLE','RELAY','RIFT','ASH','ORBIT','OBJECT','DUB TRACE','DUST LOOP','TOY HOUSE'];
  const VARIANTS = {
    VEIL:['AERIAL BLOOM','METAL GLASS','TAPE GLOW'],
    PULSE:['DRY GRID','FM STEP','LOW CIRCUIT'],
    CURRENT:['HUM FIELD','BELL DRIFT','LOW TIDE'],
    PARTICLE:['DUST RAIN','BROKEN TOYS','GRAIN LOOP'],
    RELAY:['ECHO CHAMBER','CHIMING REPLY','FRAYED SIGNAL'],
    RIFT:['OFF GRID','SOFT PRESSURE','FRACTURED DANCE'],
    ASH:['TAPE DUST','RUSTED AIR','GHOST HISS'],
    ORBIT:['INTERLOCK','CIRCULAR BELLS','MICRO ARPEGGIO'],
    OBJECT:['TABLE DUST','GLASS POCKET','PLASTIC STEPS'],
    'DUB TRACE':['SPACE RETURN','HOLLOW ECHO','LOST PULSE'],
    'DUST LOOP':['FRAYED TAPE','WEAK SIGNAL','CLOSED CASSETTE'],
    'TOY HOUSE':['SOFT FLOOR','PLASTIC CLUB','SMALL PARADE']
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
  // 写真特徴から12種類の音響エンジンの選択確率を作る。
  // 全種類の巡回や前回エンジンの強制除外はしない。同じ写真固有の傾向を保持する。
  function engineWeights(f){
    const dark=1-f.light;
    // 画像解析のエッジ値は小さめの範囲に集中しやすい。
    // 絶対的な輪郭密度と、方向性の信頼度を補正して使う。
    const detail=clamp(f.edge*3.5+f.texture*.22,0,1);
    const tex=clamp(f.texture*1.9,0,1);
    const open=clamp(1-detail*.85-tex*.16,0,1);
    const axis=clamp(f.orientation,0,1)*detail;
    const cellContrast=Math.sqrt(f.cells.reduce((v,x)=>v+(x-f.light)**2,0)/16);
    const raw=[
      .35+1.65*open+.95*f.highlights+.60*(1-detail)+.60*f.colorDiversity,       // VEIL
      .30+2.80*detail+1.15*axis+.90*f.contrast,                            // PULSE
      .35+2.20*dark+1.45*(1-detail)+.95*f.spatialContrast,                         // CURRENT
      .30+2.45*tex+1.00*f.colorDiversity+.90*f.saturation,                    // PARTICLE
      .30+1.35*f.colorDiversity+1.25*f.highlights+.85*f.balance+.85*f.saturation,   // RELAY
      .30+1.9*axis+1.45*detail+1.15*f.spatialContrast+cellContrast,        // RIFT
      .30+1.7*dark+1.10*tex+1.15*(1-f.saturation)+.6*f.cool,                 // ASH
      .30+1.4*f.hue+1.35*f.saturation+1.2*open+.80*f.colorDiversity,         // ORBIT
      .30+2.4*tex+1.0*detail+1.0*f.spatialContrast+.7*f.colorDiversity, // OBJECT
      .30+1.8*open+1.1*f.cool+.85*f.highlights+.7*f.colorDiversity,    // DUB TRACE
      .30+2.1*(1-f.saturation)+1.4*tex+1.1*(1-f.light),                // DUST LOOP
      .30+1.6*f.saturation+1.0*f.light+1.0*axis+.8*detail           // TOY HOUSE
    ];
    // エンジン全種を均等に引くのではなく、写真ごとの偏りを強める。
    // 別の写真では異なるグループが選ばれ、同じ写真では似た傾向が再び現れてよい。
    return raw.map(v=>Math.pow(Math.max(.1,v),3.7));
  }
  function chooseEngine(f,mutation=0){
    const weights=engineWeights(f);
    const m=Math.max(0,Math.floor(mutation));
    const r=new Random((f.hash^Math.imul(m+1,0x9e3779b9)^0x54c3a1b7)>>>0);
    const total=weights.reduce((a,b)=>a+b,0);
    let pos=r.next()*total;
    for(let i=0;i<weights.length;i++){
      pos-=weights[i];
      if(pos<0) return i;
    }
    return weights.length-1;
  }
  function imageBpm(f,engine,seed){
    const ranges=[[54,86],[88,136],[40,72],[76,128],[64,108],[94,148],[45,82],[80,134],[72,122],[76,124],[58,106],[104,138]][engine];
    let drive;
    if(engine===0)drive=.12+f.saturation*.15+(1-f.edge)*.5+f.light*.12+f.colorDiversity*.2;
    else if(engine===1)drive=.15+f.edge*.42+f.texture*.22+f.orientation*.12;
    else if(engine===2)drive=.10+(1-f.light)*.4+(1-f.edge)*.32+f.spatialContrast*.1;
    else if(engine===3)drive=.14+f.texture*.38+f.colorDiversity*.16+f.edge*.16;
    else if(engine===4)drive=.20+f.highlights*.22+f.colorDiversity*.30+f.saturation*.16;
    else if(engine===5)drive=.24+f.edge*.29+f.orientation*.22+f.contrast*.15;
    else if(engine===6)drive=.12+(1-f.light)*.32+f.texture*.22+(1-f.saturation)*.16;
    else if(engine===7)drive=.18+f.saturation*.29+f.hue*.18+f.openness*.22;
    else if(engine===8)drive=.22+f.texture*.35+f.edge*.24+f.orientation*.1;
    else if(engine===9)drive=.15+f.openness*.35+f.highlights*.18+f.cool*.12;
    else if(engine===10)drive=.12+(1-f.saturation)*.24+f.texture*.33+(1-f.light)*.15;
    else drive=.24+f.saturation*.28+f.light*.14+f.edge*.16;
    const r=new Random((f.hash^seed^0x71c48e21)>>>0);
    return Math.round(clamp(mix(ranges[0],ranges[1],clamp(drive,0,1))+(r.next()-.5)*6,ranges[0],ranges[1]));
  }

  // PHOTO SCORE: 写真そのものが生成する作曲地図。
  // 長い静寂と小節単位の発展を作り、ただのランダムノート配置を避ける。
  // f の特徴量はSHOOT時に固定。seedはMUTATEの小さな変奏にだけ用いる。
  function makeComposition(f,engine,seed,bpm,duration){
    const rr=new Random(((f.hash>>>0)^seed^0x6a1d8537)>>>0);
    const cells=f.cells||Array(16).fill(.5), edges=f.edgeCells||Array(16).fill(.1);
    const sats=f.satCells||Array(16).fill(.2), hues=f.hueCells||Array(16).fill(.5);
    const clip=clamp;
    const detail=clip((f.edge||0)*3.4+(f.texture||0)*.48,0,1);
    const complexity=clip((f.spatialContrast||0)*1.6+(f.colorDiversity||0)*.40+(f.contrast||0)*.8,0,1);
    const continuity=clip(1-detail*.56-(f.contrast||0)*.52,0,1);
    // エンジンごとに解釈を変える。フィールド系は静寂と長音を優先。
    const rhythmic=[.3,.85,.15,.60,.45,.92,.23,.65,.82,.47,.67,.86][engine];
    const density=clip(.24+detail*.30+(f.saturation||0)*.12+complexity*.14+rhythmic*.12-continuity*.10, .18,.91);
    const silence=clip(.18+continuity*.48-detail*.13+rr.range(-.055,.055),.10,.75);
    const changeRate=complexity>.49?2:(complexity>.27?4:8); // 基準となる和声変化の小節周期
    const bars=Math.max(1,Math.round(duration/(60/bpm*4)));
    const barEnergy=[];const motif=[];const harmony=[];
    const startCell=((f.hash>>>5)%16), stride=[1,3,5,7][(f.hash>>>12)%4];
    for(let bar=0;bar<bars;bar++){
      const cell=(startCell+bar*stride)%16;
      const light=cells[cell]||0,edge=edges[cell]||0,sat=sats[cell]||0;
      const local=clip(light*.27+edge*.46+sat*.24,0,1);
      const movement=.14*Math.sin((bar+.5)/bars*Math.PI)+.13*Math.cos(bar*1.7+(f.hue||0)*5);
      const wanted=clip(.21+density*.55+local*.34+movement+rr.range(-.08,.08),.14,1.0);
      barEnergy.push(wanted);
    }
    // フィールド系は短いブレイク、ビート系では密度の明確な谷を作る。
    if(bars>=6){
      const quietBar=1+Math.floor(((f.hash>>>15)%Math.max(2,bars-2)));
      barEnergy[quietBar]*=(.38+.23*(1-silence));
      if(bars>=8)barEnergy[(quietBar+3)%bars]*=.58;
    }
    for(let i=0;i<16;i++){
      const cell=(i*stride+startCell)%16;
      const local=clip((cells[cell]||0)*.28+(edges[cell]||0)*.48+(sats[cell]||0)*.24,0,1);
      const accent=(i%4===0?.17:(i%4===2?.06:0));
      motif.push(clip(.18+.46*local+.35*density+accent+rr.range(-.06,.06),.10,.97));
    }
    const changes=Math.max(1,Math.ceil(bars/changeRate));
    for(let k=0;k<changes;k++){
      const cell=(k*5+startCell)%16;
      const v=(cells[cell]||0)*.43+(hues[cell]||0)*.28+(sats[cell]||0)*.29;
      harmony.push(v>.67?2:(v<.33?-2:0));
    }
    harmony[0]=0; // 出発点は元音階のまま
    const rate=clip(.55+.48*density+.10*(f.orientation||0),.55,1.2);
    const identity={density,silence,continuity,complexity,changeRate,bars,barEnergy,motif,harmony,rate};
    // 視覚側が毎フレーム参照する滑らかな「構成の呼吸」。
    const N=Math.max(48,Math.ceil(duration*8));
    const timeline=new Float32Array(N);
    const transition=new Float32Array(N);
    for(let i=0;i<N;i++){
      const barPos=i/N*bars;
      const a=Math.floor(barPos)%bars, b=(a+1)%bars;
      const u=barPos-Math.floor(barPos), smooth=u*u*(3-2*u);
      const base=barEnergy[a]*(1-smooth)+barEnergy[b]*smooth;
      const phrasePhase=(barPos/changeRate)%1;
      const swell=.91+.09*Math.sin(Math.PI*phrasePhase);
      timeline[i]=clip(base*swell,.08,1);
      const distance=Math.min(phrasePhase,1-phrasePhase);
      transition[i]=Math.exp(-(distance*distance)/.005)*(i>0?.8:0);
    }
    identity.timeline=timeline;identity.transition=transition;
    return identity;
  }

  const scales=[[0,2,3,7,9],[0,2,5,7,10],[0,3,5,7,10],[0,2,4,7,9],[0,1,5,7,8]];
  const midiToHz=m=>440*Math.pow(2,(m-69)/12);
  class SoundWorld {
    constructor(f,engine,seed){
      this.f=f; this.engine=engine; this.seed=seed>>>0; this.rng=new Random(this.seed);
      this.variant=this.chooseVariant();
      this.name=ENGINES[this.engine]; this.variantName=VARIANTS[this.name][this.variant];
      this.bpm=imageBpm(f,engine,seed); this.beat=60/this.bpm;
      this.duration=([2,6,10].includes(this.engine)) ? this.beat*24 : this.beat*32;
      this.n=Math.ceil(this.duration*SR);
      this.left=new Float32Array(this.n); this.right=new Float32Array(this.n);
      this.root=36+Math.round(f.r*4+f.b*5+f.g*3+f.spatialContrast*3+f.hue*5);
      this.scale=scales[(Math.floor((f.saturation*.55+f.colorDiversity*.45)*17)+((seed>>>4)%scales.length))%scales.length];
      this.events=[];
      this.composition=makeComposition(f,engine,seed,this.bpm,this.duration);
      this.lofiAmount=this.getLofiAmount();
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
      }else if(this.engine===3){
        if(f.texture>.56 && f.edge>.32) return 0;
        if(f.colorDiversity>.50 || f.saturation>.38) return 1;
        return 2;
      }else if(this.engine===4){
        if(f.highlights>.14) return 1;
        if(f.texture>.4) return 2;
        return 0;
      }else if(this.engine===5){
        if(f.orientation>.4) return 0;
        if(f.light<.38) return 1;
        return 2;
      }else if(this.engine===6){
        if(f.saturation<.23) return 0;
        if(f.edge>.35) return 1;
        return 2;
      }else if(this.engine===7){
        if(f.hue>.47) return 1;
        if(f.saturation>.36) return 2;
        return 0;
      }else if(this.engine===8){
        if(f.edge>.36) return 0;
        if(f.highlights>.12) return 1;
        return 2;
      }else if(this.engine===9){
        if(f.openness>.65) return 0;
        if(f.cool>.16) return 1;
        return 2;
      }else if(this.engine===10){
        if(f.saturation<.20) return 0;
        if(f.texture>.38) return 1;
        return 2;
      }else{
        if(f.light>.58) return 2;
        if(f.texture>.38) return 1;
        return 0;
      }
    }
    note(degree,oct=0){
      const len=this.scale.length, ix=((degree%len)+len)%len;
      return midiToHz(this.root+this.scale[ix]+Math.floor(degree/len)*12+oct*12);
    }
    getLofiAmount(){
      const f=this.f;
      if(this.engine===0 && this.variant===2) return clamp(.24 + f.texture*.22 + (1-f.light)*.08,0,.52);
      if(this.engine===1 && this.variant===2) return clamp(.14 + f.edge*.12 + f.texture*.10,0,.34);
      if(this.engine===2 && this.variant===0) return clamp(.08 + (1-f.light)*.10,0,.22);
      if(this.engine===3 && this.variant===1) return clamp(.18 + f.texture*.20 + f.colorDiversity*.10,0,.45);
      if(this.engine===4 && this.variant===2) return clamp(.19+f.texture*.18,0,.41);
      if(this.engine===6) return clamp(.27+f.texture*.18+(1-f.light)*.08,0,.53);
      if(this.engine===5 && this.variant===2) return .15;
      if(this.engine===8) return .05+f.texture*.08;
      if(this.engine===10) return .30+f.texture*.19+(1-f.saturation)*.08;
      if(this.engine===9 && this.variant===2) return .12;
      return clamp(.02 + f.texture*.03,0,.08);
    }
    // 同じ小節位置では同じ休符傾向を持つ。主題と空白を共存させる。
    activityAt(at){
      const c=this.composition;
      const bar=Math.min(c.bars-1,Math.max(0,Math.floor(at/(this.beat*4))));
      const step=Math.max(0,Math.floor(at/this.beat*4))%16;
      return {bar,step,energy:c.barEnergy[bar],accent:c.motif[step]};
    }
    eventLevel(at,kind='tone',duration=0){
      const c=this.composition, a=this.activityAt(at);
      if(duration>=this.beat*1.35 || kind==='drone' || kind==='pad'){
        return clamp(.60+a.energy*.52,.45,1.18);
      }
      const noteCode=kind.split('').reduce((x,v)=>((x*33+v.charCodeAt(0))>>>0),5381);
      const step=Math.floor(at/this.beat*8);
      const x=((this.seed^Math.imul(step+1,0x27d4eb2d)^noteCode)>>>0);
      const z=new Random(x).next();
      const probability=clamp(.38+c.density*.32+a.accent*.24+a.energy*.20-c.silence*.18,.25,.97);
      if(z>probability) return 0;
      return clamp(.65+a.energy*.50,.55,1.2);
    }
    harmonicPitch(freq,at,kind,duration){
      if(kind==='drone'||kind==='bass'||duration>this.beat*2.8)return freq;
      const c=this.composition,bar=Math.max(0,Math.floor(at/(this.beat*4)));
      const shift=c.harmony[Math.min(c.harmony.length-1,Math.floor(bar/c.changeRate))]||0;
      return freq*Math.pow(2,shift/12);
    }
    addEvent(time,low=0,mid=0,high=0,accent=0){ this.events.push({time,low,mid,high,accent}); }
    addDust(at,dur,amp,pan=0){
      const level=this.eventLevel(at,'dust',dur);if(!level)return;
      amp*=level;
      const a=Math.max(0,Math.floor(at*SR)), b=Math.min(this.n,Math.ceil((at+dur)*SR));
      const l=Math.sqrt((1-pan)/2), r=Math.sqrt((1+pan)/2); let band=0;
      this.addEvent(at,amp*.15,amp*.55,amp*.8,amp*.45);
      for(let i=a;i<b;i++){
        const t=(i-a)/SR, rem=(b-i)/SR, env=clamp(Math.min(t/.02,rem/.08,1),0,1);
        const white=this.rng.range(-1,1); band=band*.72+white*.28;
        const hiss=(white*.42 + band*.58)*amp*env;
        this.left[i]+=hiss*l; this.right[i]+=hiss*r;
      }
    }
    // 小さな物体の接触を模した合成打音。実録音のサンプルは使用しない。
    // 周波数の異なる共鳴と帯域を制限した摩擦音を混合して、クリックだけにならないようにする。
    addObjectImpact(at,amp,material='wood',pan=0){
      if(at<0||at>=this.duration)return;
      const level=this.eventLevel(at,'object'+material,.15);if(!level)return;
      amp*=level;
      const r=this.rng, f=this.f;
      const freq=material==='glass'?r.range(750,1250):material==='plastic'?r.range(230,450):r.range(130,280);
      const dur=material==='glass'?.26:material==='plastic'?.15:.115;
      const a=Math.max(0,Math.floor(at*SR)),end=Math.min(this.n,Math.floor((at+dur)*SR));
      const pl=Math.sqrt((1-pan)*.5),pr=Math.sqrt((1+pan)*.5);
      let low=0,phase=0;
      this.addEvent(at,material==='wood'?amp*1.8:amp*.3,amp*1.2,material==='glass'?amp*1.7:amp*.5,amp*1.8);
      for(let j=a;j<end;j++){
        const t=(j-a)/SR, decay=Math.exp(-t*(material==='glass'?13:material==='plastic'?26:36));
        phase+=TAU*freq/SR*(1-.035*Math.exp(-t*25));
        const white=r.range(-1,1);low=.78*low+.22*white;
        const reson=(material==='glass'? .48*Math.sin(phase)+.28*Math.sin(phase*1.51)+.14*Math.sin(phase*2.37):
          material==='plastic'?.58*Math.sin(phase)+.18*Math.sin(phase*1.9):.52*Math.sin(phase)+.09*Math.sin(phase*2.45));
        const hiss=(white-low)*(.17+.12*f.texture)*Math.exp(-t*80);
        const v=(reson+hiss)*decay*amp*Math.min(1,t*550+0.03);
        this.left[j]+=v*pl;this.right[j]+=v*pr;
      }
    }
    addTone(freq,at,dur,amp,kind='soft',pan=0,opts={}){
      const level=this.eventLevel(at,kind,dur);if(!level)return;
      amp*=level;
      freq=this.harmonicPitch(freq,at,kind,dur);
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
      const level=this.eventLevel(at,kind,dur);if(!level)return;
      amp*=level;
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
      const c=this.composition, a=this.activityAt(at);
      // ビートの骨格は残すが、写真の密度が低いと拍を引き算する。
      if(Math.floor(at/this.beat)%4!==0 && c.density<.49 && a.accent<.49)return;
      amp*=clamp(.6+a.energy*.6,.52,1.16);
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
        for(let i=0;i<12;i++) if(r.chance(.55)) this.addDust(r.range(0,this.duration-.25),r.range(.08,.28),r.range(.0025,.006),r.range(-.8,.8));
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
      if(v===2){
        for(let bar=0; bar<8; bar+=2) this.addTone(this.note(bar%4?2:0,-1),bar*4*b,5*b,.032,'drone',-.12,{attack:b*.4,release:b*.65,bands:[.68,.22,.05]});
        for(let step=0; step<32; step+=2) if(r.chance(.46)) this.addDust(step*b+b*.45,.05,.0035 + f.texture*.0025,r.range(-.6,.6));
      }
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
      if(v===0 && r.chance(.75)) for(let i=0;i<6;i++) this.addDust(i*this.duration/6,this.duration/10,.0018 + (1-f.light)*.002,Math.sin(i));
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
      if(v===1){ for(let i=0;i<10;i++) if(r.chance(.65)) this.addDust(r.range(0,this.duration-.18),r.range(.03,.16),r.range(.003,.007),r.range(-1,1)); }
    }
    // RELAY: ディレイ音そのものを旋律として再構成。4小節の主題と空白に返事がある。
    // 空間を埋めないため、連打を常時鳴らさず、応答のある場面を限定する。
    relay(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const motif=Array.from({length:8},(_,i)=>Math.floor(f.cells[(i*2+3)%16]*9+f.hueCells[i]*5+f.edgeCells[i]*5)%7);
      const count=v===0?5:v===1?7:4;
      for(let cycle=0;cycle<4;cycle++){
        const start=cycle*8*b;
        for(let j=0;j<count;j++){
          const x=j%8,baseTime=start+(x*1.25+(j%2)*.22)*b;
          const degree=motif[(j+cycle)%8],note=this.note(degree,1);
          const pan=(j%2===0?-.62:.62)*(.7+f.saturation*.4);
          this.addTone(note,baseTime,b*(v===1?.42:.6),v===1?.063:.076,v===1?'glass':'soft',pan,
            {attack:.014,release:.13,mod:.18+f.colorDiversity,bands:[.08,.45,.68]});
          // 数回だけ後ろに小さな返答を足す。周波数は写真由来の音階から選択。
          if(r.chance(.75)){
            const taps=v===0?2:v===1?3:2;
            for(let k=1;k<=taps;k++){
              const t=baseTime+b*k*(v===2?.7:.50);
              this.addTone(this.note(degree+(v===1?k:0),1),t,b*.24,.048*Math.pow(.54,k),v===1?'glass':'ping',-pan,
                {attack:.004,release:.10,bands:[.07,.32,.78]});
            }
          }
        }
        // 主題の裏に小さなロングトーン。RELAYを単なるチャイム列にしない。
        this.addTone(this.note(motif[cycle%8]-1,0),start+b*.8,5.8*b,.034,'pad',r.range(-.3,.3),
          {attack:b*.8,release:b*1.1,bands:[.28,.45,.35]});
      }
    }
    // RIFT: 定型四つ打ちでなく、3拍/5拍の長さが異なるモチーフを共存させる。
    // 音の多さではなく、休符と位相のずれによってグルーヴを生む。
    rift(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const pattern=v===0?[1,0,1,0,0,1,0,1,0,0]:v===1?[1,0,0,0,1,0,0,1,0,0]:[1,0,1,0,1,0,0,1,0,0];
      for(let step=0;step<64;step++){
        const time=step*b*.5;
        const c=f.cells[(step*3)%16],e=f.edgeCells[(step*5)%16],s=f.satCells[(step*7)%16];
        if(pattern[step%10] && r.chance(.50+.25*e)){
          const note=Math.floor((c*7+e*8+s*6))%5;
          const bass=step%8===0;
          if(bass)this.kick(time,.10+e*.035);
          this.addTone(this.note(note,bass?-1:0),time,b*(bass?.45:.23),bass?.075:.049,bass?'bass':'fm',r.range(-.5,.5),
            {attack:.008,release:.12,mod:.25+s,bands:bass?[.85,.23,.04]:[.14,.65,.37]});
        }
        if(step%5===2 && r.chance(.32+s*.34))this.addNoise(time+b*.08,.035,.038,'hat',r.range(-.9,.9));
        if(step%16===15 && r.chance(.55))this.addTone(this.note(4,2),time+b*.12,b*.21,.032,'ping',r.range(-.8,.8),{release:.07,bands:[.05,.24,.86]});
      }
      for(let i=0;i<4;i++)this.addTone(this.note([0,1,3,2][i],-1),i*8*b,6.2*b,.025,'drone',r.range(-.22,.22),
        {attack:b*.7,release:b*1.2,bands:[.75,.20,.08]});
    }
    // ASH: 低サンプルレートのレコード/テープに似た薄い掠れと共鳴。
    // 音程を持つ要素も残し、単なるホワイトノイズにしない。
    ash(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      for(let i=0;i<4;i++){
        const t=i*6*b,deg=Math.round(f.cells[i*4]*8+f.hueCells[i*4]*2)%5;
        this.addTone(this.note(deg,-1),t,5.9*b,.065,'drone',r.range(-.55,.55),{attack:b*.9,release:b*1.2,
          mod:.3+f.texture,bands:[.68,.24,.13]});
        if(i%2===0)this.addTone(this.note(deg+2,1),t+b*.8,3.6*b,.022,'soft',-r.range(-.7,.7),
          {attack:b*.7,release:b*.9,bands:[.14,.55,.32]});
      }
      for(let i=0;i<16;i++){
        const t=i*1.5*b;
        this.addDust(t,Math.min(b*r.range(.35,1.25),this.duration-t),r.range(.0025,.008)*(1+f.texture*.5),r.range(-.95,.95));
        if(r.chance(.23+f.edge*.3)){
          this.addNoise(t+b*.25,Math.min(.2,this.duration-t-b*.25),.012+f.texture*.02,'air',r.range(-1,1));
        }
      }
      if(v===1){
        for(let i=0;i<9;i++){
          const t=r.range(0,this.duration-1),d=r.range(.35,.95);
          this.addTone(this.note(r.pick([0,2,4]),2),t,d,.024,'glass',r.range(-1,1),{attack:.02,release:.24,
            bands:[.03,.23,.91]});
        }
      }
    }
    // ORBIT: 異なる周期の明るい音列が少しずつ位相をずらして交差する。
    // ステップ列は写真16領域の明度・色・輪郭から作るため、写真ごとに違う旋律を得る。
    orbit(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const seq=Array.from({length:16},(_,i)=>Math.floor(f.cells[i]*6+f.satCells[i]*8+f.edgeCells[i]*4)%6);
      const offsets=[0,3,6];
      for(let layer=0;layer<3;layer++){
        const spacing=[.75,1.25,2.0][layer]*b;
        const count=Math.ceil(this.duration/spacing);
        for(let j=0;j<count;j++){
          if(!r.chance((layer===0?.79:layer===1?.57:.42)+f.saturation*.10))continue;
          const t=j*spacing+(layer===1?b*.28:layer===2?b*.37:0),degree=seq[(j*([1,3,5][layer])+offsets[layer])%16];
          const amp=[.046,.039,.027][layer];
          const kind=layer===0?(v===2?'fm':'ping'):layer===1?'glass':'soft';
          this.addTone(this.note(degree+layer,layer===2?0:1),t,Math.min(spacing*(layer===2?1.4:.65),this.duration-t),amp,kind,
            layer===0?-.55:layer===1?.6:r.range(-.25,.25),{attack:layer===2?.18:.008,release:layer===2?.46:.10,
              mod:.2+f.saturation,bands:layer===2?[.26,.47,.23]:[.06,.39,.78]});
        }
      }
      for(let i=0;i<4;i++)this.addTone(this.note(seq[i*4],-1),i*8*b,6*b,.027,'pad',r.range(-.4,.4),
        {attack:b,release:b*1.0,bands:[.45,.35,.2]});
    }
    // OBJECT: 具体音に近い小さな接触音が拍を形成する。写真の局所密度で発音が変わる。
    object(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const material=['wood','glass','plastic'][v];
      const pattern=[1,0,0,1,0,1,0,0,1,0,1,0,0,0,1,0];
      for(let bar=0;bar<8;bar++){
        for(let step=0;step<16;step++){
          const k=(bar*5+step*3)%16, e=f.edgeCells[k],c=f.cells[k],sat=f.satCells[k];
          const isMotif=pattern[(step+Math.floor(c*4))%16]===1;
          if(!r.chance((isMotif?.62:.12)+e*.22+sat*.08)) continue;
          const at=(bar*4+step*.25)*b+r.range(-.018,.026);
          const accent=step%4===0?1.0:.54;
          this.addObjectImpact(at,(.045+e*.040)*accent,material,r.range(-.7,.7));
          if(step%8===5 && r.chance(.33+f.texture*.12))
            this.addObjectImpact(at+b*.22,.020,'glass',r.range(-1,1));
        }
        if(bar%2===0)this.addTone(this.note(bar%3,-1),bar*4*b,5.4*b,.022,'soft',r.range(-.4,.4),
          {attack:.7,release:.9,bands:[.45,.3,.1]});
      }
    }
    // DUB TRACE: 音を詰めず、少数の原音が遅延の間隔を使って応答する。
    dubTrace(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const delayBeats=v===0?.75:v===1?1.0:1.5;
      for(let bar=0;bar<8;bar++){
        const t=bar*4*b,degree=Math.floor(f.cells[(bar*2)%16]*9+f.hueCells[(bar*2+1)%16]*5)%5;
        if(bar%2===0)this.addTone(this.note(degree,-1),t,3*b,.053,'bass',-.06,
          {attack:.04,release:.45,bands:[.9,.16,.03]});
        const hits=v===2?1:2;
        for(let i=0;i<hits;i++){
          if(!r.chance(.6+f.openness*.25))continue;
          const at=t+(i===0?.5:2.25)*b;
          const pan=i===0?-.45:.5;
          this.addTone(this.note(degree+i,1),at,b*.25,.058,v===1?'glass':'ping',pan,{attack:.008,release:.18});
          for(let tap=1;tap<=3;tap++){
            const when=at+tap*delayBeats*b;if(when>this.duration-.15)break;
            this.addTone(this.note(degree+i+(v===2?tap%2:0),1),when,b*.20,.056*Math.pow(.48,tap),'soft',-pan,
              {attack:.012,release:.12,bands:[.16,.48,.36]});
          }
        }
        if(bar%2===1 && r.chance(.6)) this.addNoise(t+b*1.5,.07,.024,'air',r.range(-.7,.7));
      }
    }
    // DUST LOOP: ざらつきと弱い拍の反復。ノイズは発音の隙間に置く。
    dustLoop(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const cycle=12;
      const motif=Array.from({length:cycle},(_,i)=>{
        const cell=(i*5)%16;
        return (f.cells[cell]*.45+f.edgeCells[cell]*.35+f.satCells[cell]*.2);
      });
      for(let step=0;step<24;step++){
        const t=step*b, m=motif[step%cycle];
        if(step%3===0 || (r.chance(.12+m*.36)))
          this.addObjectImpact(t+b*r.range(-.016,.025),.033+m*.025,'wood',r.range(-.65,.65));
        if(step%2===1&&r.chance(.36+m*.32))
          this.addDust(t+b*.3,Math.min(.12+b*.12,this.duration-t-b*.3),.0025+m*.003,r.range(-.9,.9));
        if(step%6===0)this.addTone(this.note(Math.floor(m*7)%5,-1),t,2.7*b,.047,'soft',r.range(-.3,.3),
          {attack:.12,release:.4,bands:[.65,.24,.07]});
        if(v===1 && step%4===3)this.addTone(this.note((step*3)%5,1),t+b*.67,.13,.021,'ping',r.range(-.8,.8),{release:.07});
      }
    }
    // TOY HOUSE: チープなシンセの四拍骨格。ただし音の数は少なく、押し付けない。
    toyHouse(){
      const r=this.rng,b=this.beat,f=this.f,v=this.variant;
      const seq=Array.from({length:8},(_,i)=>Math.floor(f.cells[i*2]*7+f.satCells[i*2]*8)%5);
      for(let bar=0;bar<8;bar++){
        for(let beat=0;beat<4;beat++){
          const at=(bar*4+beat)*b;
          this.kick(at,.072+(v===2?.02:0));
          if((beat===1||beat===3)&&r.chance(.52))this.addObjectImpact(at+b*.04,.024,'plastic',r.range(-.2,.2));
          if(r.chance(.65+f.saturation*.1))this.addTone(this.note(seq[(bar+beat)%8],-1),at+b*.04,b*.35,.037,'bass',0,
            {attack:.008,release:.15,bands:[.82,.19,.02]});
          if(r.chance(v===1?.67:.48))this.addTone(this.note(seq[(bar*3+beat)%8]+2,1),at+b*.57,b*.19,.034,
            v===2?'pulse':'fm',r.range(-.55,.55),{attack:.005,release:.085,mod:.25+f.saturation,bands:[.12,.54,.28]});
        }
        if(bar%2===0)this.addTone(this.note(seq[(bar+2)%8],0),bar*4*b+b*.3,3.4*b,.021,'soft',r.range(-.4,.4),
          {attack:.35,release:.48,bands:[.2,.42,.3]});
      }
    }
    applyLofi(){
      const l=this.lofiAmount||0; if(l<=0) return;
      const L=this.left, R=this.right, n=this.n, rng=new Random((this.seed^0x5a17e3b1)>>>0);
      const hold=1+Math.floor(2+l*7), mixAmt=.08 + l*.16, hiss=.0008 + l*.0035, blur=.04 + l*.12;
      let holdL=0, holdR=0, prevL=0, prevR=0;
      for(let i=0;i<n;i++){
        if(i%hold===0){ holdL=L[i]; holdR=R[i]; }
        const flutter=1 + Math.sin(i*0.00075 + this.f.hue*TAU)*(.004 + l*.012) + Math.sin(i*0.00017 + this.f.saturation*3)*(.002 + l*.008);
        let xL=mix(L[i],holdL,mixAmt)*flutter, xR=mix(R[i],holdR,mixAmt)*flutter;
        const noise=(rng.next()*2-1)*hiss*(.5 + .5*Math.abs(xL+xR));
        xL += noise; xR += noise*.9;
        prevL += (xL-prevL)*blur; prevR += (xR-prevR)*blur;
        L[i]=mix(xL,prevL,l*.55); R[i]=mix(xR,prevR,l*.55);
      }
    }
    finish(){
      const l=this.left, r=this.right, n=this.n; let prevL=0,prevR=0,yL=0,yR=0;
      for(let i=0;i<n;i++){
        const xL=l[i], xR=r[i]; yL=.992*(yL+xL-prevL); yR=.992*(yR+xR-prevR); prevL=xL; prevR=xR; l[i]=yL; r[i]=yR;
      }
      this.applyLofi();
      // 小節構造の緩やかな音量包絡。バー境界で急に切らない。
      // フィールド系は薄く、ビート系は空白と起伏が明瞭になる。
      const c=this.composition;
      const rhythmic=[.24,.84,.20,.62,.48,.91,.27,.63,.88,.51,.65,.85][this.engine];
      const tl=c.timeline, len=tl.length;
      for(let i=0;i<n;i++){
        const v=i/Math.max(1,n-1)*(len-1),j=Math.floor(v),u=v-j;
        const energy=tl[j]*(1-u)+tl[Math.min(len-1,j+1)]*u;
        const floor=1-rhythmic*.65;
        const g=floor+(1-floor)*energy;
        l[i]*=g;r[i]*=g;
      }
      let peak=0,sum=0;
      for(let i=0;i<n;i++){ peak=Math.max(peak,Math.abs(l[i]),Math.abs(r[i])); sum+=l[i]*l[i]+r[i]*r[i]; }
      const rms=Math.sqrt(sum/(2*n)); const targets=[.094,.118,.093,.108,.096,.109,.084,.104,.100,.090,.087,.111], target=targets[this.engine];
      const gain=Math.min(3.3,target/Math.max(rms,1e-5),.72/Math.max(peak,1e-5));
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
      return { sampleRate:SR,length:n,duration:this.duration,bpm:Math.round(this.bpm),engine:this.engine,name:this.name,variant:this.variantName,left:l,right:r,envelope,low,mid,high,hit,seed:this.seed,lofi:this.lofiAmount,composition:this.composition };
    }
  }
  function synthesize(features,engine,seed){
    const w=new SoundWorld(features,engine,seed);
    if(engine===0) w.veil();
    else if(engine===1) w.pulse();
    else if(engine===2) w.current();
    else if(engine===3) w.particle();
    else if(engine===4) w.relay();
    else if(engine===5) w.rift();
    else if(engine===6) w.ash();
    else if(engine===7) w.orbit();
    else if(engine===8) w.object();
    else if(engine===9) w.dubTrace();
    else if(engine===10) w.dustLoop();
    else if(engine===11) w.toyHouse();
    else throw new Error('Invalid engine');
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
  root.NWAudio={analyzeImage,engineWeights,chooseEngine,imageBpm,makeComposition,synthesize,makeBuffer,encodeWav,ENGINES,VARIANTS};
})(window);
