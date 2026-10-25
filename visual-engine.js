/*
 * NEGATIVE WEATHER v0.2 — Character Drift visual synthesis
 * カラー写真を維持しながら、局所領域の独立した動きと初期CG的な時差を合成する。
 * WebGLが使える環境ではシェーダーで、非対応環境では軽量なCPU変位場で描画する。
 * 写真を単純な矩形タイルへ切断せず、有機的なマスクで各パッチを変形する。
 */
(function(root){
  'use strict';
  const VERTEX=`
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main(){v_uv=(a_position+1.0)*.5;gl_Position=vec4(a_position,0.,1.);}`;
  const FRAGMENT=`
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_photo;
    uniform float u_time,u_energy,u_seed,u_engine,u_bpm,u_activity;
    uniform vec2 u_fit;
    float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise2(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
                 mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
    }
    float field(vec2 p){return .63*noise2(p)+.28*noise2(p*2.1+19.2)+.09*noise2(p*4.07+31.5);}
    float blob(vec2 p,vec2 center,vec2 radius){
      vec2 d=(p-center)/radius;
      return 1.-smoothstep(.6,1.12,length(d));
    }
    vec3 photo(vec2 uv){return texture2D(u_photo,clamp((uv-.5)*u_fit+.5,.001,.999)).rgb;}
    void main(){
      vec2 uv=v_uv;
      float mode=u_engine,beat=u_time*u_bpm/60.,energy=clamp(u_energy,0.,1.);
      float t=u_time;
      // 量子化された更新タイミング。PULSE/PARTICLEは「不器用な初期CG」のコマ送り。
      float stepRate=mode<.5?8.0:mode<1.5?11.0:mode<2.5?12.0:9.0;
      float clock=floor(t*stepRate)/stepRate;
      float stepBeat=floor(beat*2.)/2.;
      float driftTime=mode<1.5?clock:t;
      float phase=u_seed*6.2831853;
      float amount=mode<.5?.071:mode<1.5?.098:mode<2.5?.11:.09;
      amount*=.82+u_activity*.35+energy*.24;
      vec2 f=vec2(field(uv*3.+vec2(driftTime*.27+phase,driftTime*.17)),
                  field(uv*3.+vec2(27.3-driftTime*.19,8.5+driftTime*.25+phase)))-.5;
      vec2 offset=f*amount*1.3;
      float highlights=0.;
      // 異なるサイズ・速度・向きを持つ局所的な写真の「生きた領域」。
      // 一部の領域だけが独立して動くことで、単なる全画面の水面揺れを避ける。
      for(int i=0;i<5;i++){
        float k=float(i);
        vec2 id=vec2(k*3.17+phase,k*9.13+u_seed*2.0);
        vec2 c=vec2(.12+.76*hash21(id),.13+.73*hash21(id+17.3));
        vec2 rad=vec2(.13+.17*hash21(id+2.9),.14+.20*hash21(id+7.1));
        float local=blob(uv,c,rad);
        float phase2=phase+k*2.38;
        float speed=.4+.23*hash21(id+19.3);
        vec2 drift=vec2(sin(driftTime*speed+phase2),cos(driftTime*speed*.83+phase2*1.6));
        if(mode<.5)drift*=vec2(.68,.55);
        if(mode>1.5&&mode<2.5)drift*=vec2(.84,1.2);
        if(mode>2.5)drift=vec2(sin(clock*(2.2+k*.3)+phase2),cos(clock*1.73+phase2));
        offset+=local*drift*(.025+.047*hash21(id+8.0))*(1.+energy*.27);
        highlights=max(highlights,local);
      }
      if(mode>.5&&mode<1.5){
        // テンポで移動する走査線と、不規則な写真領域の段階的なジャンプ。
        float scan=sin(uv.y*29.-stepBeat*2.5+phase+field(uv*4.)*1.4);
        float line=smoothstep(.80,.99,scan);
        offset.x+=line*(.015+.042*energy);
        offset.x+=.024*sin(floor(uv.y*9.+phase)*2.0+stepBeat*.6);
      }else if(mode>1.5&&mode<2.5){
        // 大きく、ゆっくりとした波状の伸長。
        offset+=vec2(sin(uv.y*10.+t*.49+phase),cos(uv.x*8.-t*.33))*.024;
      }else if(mode>2.5){
        // 粒子的な再描画。規則正しいタイル分割ではなく、欠片の局所的なジャンプ。
        vec2 cell=floor(uv*vec2(71.,79.));
        float n=hash21(cell+vec2(floor(beat*1.5),phase));
        float mask=smoothstep(.75,.96,field(uv*7.+vec2(phase,clock*.31)));
        if(n>.83)offset+=vec2(hash21(cell+13.1)-.5,hash21(cell+7.7)-.5)*.075*mask;
      }
      vec2 pos=clamp(uv+offset,.001,.999);
      vec3 col=photo(pos);
      // 一時的な画像の遅延・二重化。残像をバッファに蓄積しないのでGPU負荷を抑えられる。
      float ghostAmount=mode<.5?.37:mode<1.5?.12:mode<2.5?.24:.20;
      vec2 echoOffset=vec2(.026*sin(t*.51+phase),-.024*cos(t*.47+phase));
      vec3 delayed=photo(clamp(uv+offset*.29+echoOffset,.001,.999));
      col=mix(col,delayed,ghostAmount*(.45+.55*highlights));
      if(mode>2.5){
        float erase=step(.975,hash21(floor(uv*vec2(121.,99.))+floor(clock*7.)));
        col=mix(col,delayed,.75*erase);
      }
      float glow=(field(uv*2.+vec2(clock*.25,phase))-.5)*(.075+energy*.035);
      col=clamp(col+vec3(glow*.89,glow,glow*.93),0.,1.);
      gl_FragColor=vec4(col,1.);
    }`;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  class PhotoRenderer {
    constructor(canvas){
      this.canvas=canvas;this.image=null;this.imageAspect=1;
      this.energy=0;this.engine=0;this.seed=.5;this.t=0;this.playing=false;
      this.features={motion:.4};this.bpm=100;this.hasPhoto=false;
      this.gl=null;this.isWebGL=false;this.previous=0;this.lastDraw=0;
      try{this.initializeGL();}catch(err){
        console.warn('Using 2D motion renderer:',err);
        this.gl=null;this.ctx=canvas.getContext('2d',{willReadFrequently:true});
        if(!this.ctx){
          const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);
          this.canvas=replacement;this.ctx=replacement.getContext('2d',{willReadFrequently:true});
        }
      }
      this.resize();window.addEventListener('resize',()=>this.resize(),{passive:true});
      requestAnimationFrame(t=>this.frame(t));
    }
    initializeGL(){
      const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
      if(!gl)throw Error('WebGL unavailable');
      const shader=(type,src)=>{
        const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
        if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;
      };
      const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,VERTEX));
      gl.attachShader(p,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);this.program=p;
      const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const at=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
      this.uniforms={};
      ['u_time','u_energy','u_seed','u_engine','u_fit','u_photo','u_bpm','u_activity'].forEach(k=>this.uniforms[k]=gl.getUniformLocation(p,k));
      const tex=gl.createTexture();this.texture=tex;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([20,30,29,255]));
      gl.uniform1i(this.uniforms.u_photo,0);this.gl=gl;this.isWebGL=true;
    }
    resize(){
      const box=this.canvas.getBoundingClientRect();if(!box.width||!box.height)return;
      const cap=this.gl?590:390;
      const scale=Math.min(window.devicePixelRatio||1,1.3,cap/Math.max(box.width,box.height));
      this.canvas.width=Math.max(1,Math.round(box.width*scale));
      this.canvas.height=Math.max(1,Math.round(box.height*scale));
      if(this.gl)this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
      this.fitPhoto();if(!this.gl&&this.image)this.prepare2D();
      if(this.hasPhoto)this.render();
    }
    fitPhoto(){
      if(!this.gl)return;
      const view=this.canvas.width/this.canvas.height,pic=this.imageAspect;
      const fit=view>pic?[1,pic/view]:[view/pic,1];
      this.gl.useProgram(this.program);this.gl.uniform2f(this.uniforms.u_fit,fit[0],fit[1]);
    }
    setPhoto(image){
      this.image=image;this.imageAspect=image.width/image.height;this.hasPhoto=true;
      if(this.gl){const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        this.fitPhoto();
      }else this.prepare2D();
      this.render();
    }
    prepare2D(){
      if(!this.ctx||!this.image)return;
      const w=this.canvas.width,h=this.canvas.height,src=document.createElement('canvas');src.width=w;src.height=h;
      const g=src.getContext('2d',{willReadFrequently:true});
      const scale=Math.max(w/this.image.width,h/this.image.height);
      g.drawImage(this.image,(w-this.image.width*scale)/2,(h-this.image.height*scale)/2,this.image.width*scale,this.image.height*scale);
      this.basePhoto=src;
      this.sourcePixels=g.getImageData(0,0,w,h).data;
      this.framePixels=this.ctx.createImageData(w,h);
    }
    setMood(index,seed,features={},bpm=100){
      this.engine=index;this.seed=(seed%100000)/100000;this.features=features;
      this.bpm=bpm;this.t=0;this.render();
    }
    frame(stamp){
      if(!this.previous)this.previous=stamp;
      // 先の描画フレームからの時間で積算し、フレーム制限によるスローモーションを防止。
      const interval=this.gl?43:85;
      if(!this.lastDraw||stamp-this.lastDraw>=interval){
        const elapsed=this.lastDraw?Math.min((stamp-this.lastDraw)/1000,.12):0;
        this.lastDraw=stamp;
        this.t+=elapsed*(this.playing?1:.36);
        this.render();
      }
      this.previous=stamp;requestAnimationFrame(t=>this.frame(t));
    }
    render(){
      if(!this.hasPhoto)return;
      if(this.gl){
        const gl=this.gl;gl.useProgram(this.program);
        gl.uniform1f(this.uniforms.u_time,this.t);
        gl.uniform1f(this.uniforms.u_energy,this.energy);
        gl.uniform1f(this.uniforms.u_seed,this.seed);
        gl.uniform1f(this.uniforms.u_engine,this.engine);
        gl.uniform1f(this.uniforms.u_bpm,this.bpm);
        gl.uniform1f(this.uniforms.u_activity,this.features.motion??.45);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      }else if(this.ctx&&this.sourcePixels){this.render2D();}
    }
    render2D(){
      const w=this.canvas.width,h=this.canvas.height,src=this.sourcePixels,dst=this.framePixels.data;
      const mode=this.engine,t=this.t,beat=t*this.bpm/60;
      const clock=mode===1||mode===3?Math.floor(t*11)/11:t;
      const cell=18,gw=Math.ceil(w/cell)+2,gh=Math.ceil(h/cell)+2;
      const dx=new Float32Array(gw*gh),dy=new Float32Array(gw*gh);
      const rng=n=>{
        const x=Math.sin(n*24.531+this.seed*194.21)*45678.382;
        return x-Math.floor(x);
      };
      const patches=[];
      for(let i=0;i<5;i++)patches.push({x:.10+.8*rng(i*17+1),y:.12+.74*rng(i*19+3),
        rx:.15+.17*rng(i*19+5),ry:.15+.2*rng(i*23+6),phase:i*2.38+this.seed*7});
      const amount=[23,32,36,30][mode]*(1+this.energy*.35);
      for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
        const x=gx*cell/w,y=gy*cell/h,i=gy*gw+gx;
        let vx=.40*Math.sin(y*9.1+clock*.62+this.seed*8)+.28*Math.cos(x*6.3-clock*.4);
        let vy=.34*Math.cos(x*7.9-clock*.51)+.31*Math.sin(y*8+clock*.48);
        for(const p of patches){
          const rr=Math.hypot((x-p.x)/p.rx,(y-p.y)/p.ry),a=clamp((1.15-rr)/.55,0,1);
          const soft=a*a*(3-2*a);
          vx+=soft*Math.sin(clock*(.45+p.x)+p.phase)*.93;
          vy+=soft*Math.cos(clock*(.48+p.y)+p.phase)*.79;
        }
        if(mode===1){vx+=.25*Math.sin(Math.floor(y*11+this.seed*7)+Math.floor(beat*2)*.5);}
        if(mode===2){vx+=.26*Math.sin(y*11+clock*.8);vy+=.28*Math.cos(x*7-clock*.4);}
        if(mode===3){vx+=.23*Math.sin(Math.floor(clock*8)+x*23);vy+=.21*Math.cos(Math.floor(clock*6)+y*17);}
        dx[i]=vx*amount;dy[i]=vy*amount;
      }
      for(let y=0;y<h;y++){
        const gy=Math.floor(y/cell),fy=(y%cell)/cell,row=y*w;
        for(let x=0;x<w;x++){
          const gx=Math.floor(x/cell),fx=(x%cell)/cell,p=gy*gw+gx,q=p+gw;
          const ddx=dx[p]+(dx[p+1]-dx[p])*fx;
          const ddy=dx[q]+(dx[q+1]-dx[q])*fx;
          const edx=dy[p]+(dy[p+1]-dy[p])*fx;
          const edy=dy[q]+(dy[q+1]-dy[q])*fx;
          const sx=clamp(Math.round(x+ddx+(ddy-ddx)*fy),0,w-1);
          const sy=clamp(Math.round(y+edx+(edy-edx)*fy),0,h-1);
          const a=(row+x)*4,b=(sy*w+sx)*4;
          const ghost=mode===0?.24:mode===2?.15:.1;
          dst[a]=src[b]*(1-ghost)+src[a]*ghost;
          dst[a+1]=src[b+1]*(1-ghost)+src[a+1]*ghost;
          dst[a+2]=src[b+2]*(1-ghost)+src[a+2]*ghost;
          dst[a+3]=255;
        }
      }
      this.ctx.putImageData(this.framePixels,0,0);
      // 少数の柔らかい形をしたパッチを独立して再描画する。
      // 全画面のうねりとは異なるタイムラグを持たせ、写真の内部に出来事を生む。
      if(this.basePhoto){
        const ctx=this.ctx;
        for(let i=0;i<3;i++){
          const p=patches[i+1],cx=p.x*w,cy=p.y*h;
          const rx=p.rx*w*.76,ry=p.ry*h*.70;
          const shift=mode===1?Math.floor(clock*7)/7:clock;
          const xx=Math.sin(shift*(.85+i*.17)+p.phase)*(mode===2?51:33);
          const yy=Math.cos(shift*(.71+i*.12)+p.phase)*(mode===2?43:28);
          ctx.save();ctx.beginPath();
          const wobble=1+.13*Math.sin(clock*.9+i*2.3);
          ctx.ellipse(cx,cy,rx*wobble,ry/wobble,.17*Math.sin(shift*.37+p.phase),0,Math.PI*2);
          ctx.clip();
          ctx.globalAlpha=(mode===0?.28:mode===1?.52:mode===2?.45:.43)+this.energy*.08;
          ctx.drawImage(this.basePhoto,xx,yy,w,h);
          ctx.restore();
        }
      }
    }
    async pngBlob(){
      this.render();return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG creation failed')),'image/png'));
    }
  }
  root.NWVisual=PhotoRenderer;
})(window);
