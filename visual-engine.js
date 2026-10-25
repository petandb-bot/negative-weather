/*
 * NEGATIVE WEATHER — Chromatic Field Renderer
 * 写真を矩形パネルへ分割せず、連続的な変位場でゆっくりと動かす。
 * iPhoneのGPU負荷を抑えるため、描画解像度とフレームレートに上限を設ける。
 */
(function (root) {
  'use strict';
  const VERTEX = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = (a_position + 1.0) * .5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`;
  const FRAGMENT = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_photo;
    uniform float u_time;
    uniform float u_energy;
    uniform float u_seed;
    uniform float u_engine;
    uniform vec2 u_fit;

    // 連続したノイズ関数。タイルや帯状の不連続を生まない。
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
    }
    float noise2(vec2 p) {
      vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
                 mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
    }
    float fbm(vec2 p) {
      return .60*noise2(p)+.28*noise2(p*2.03+17.4)+.12*noise2(p*4.01+39.2);
    }
    void main() {
      vec2 uv=v_uv;
      float t=u_time;
      float phase=u_seed*6.2831853;
      float mode=u_engine;
      float energy=clamp(u_energy,0.,1.);
      vec2 f=vec2(fbm(uv*2.2+vec2(t*.039+phase,t*.025)),
                  fbm(uv*2.4+vec2(24.1-t*.025,13.2+t*.035+phase)))-.5;
      vec2 motion=vec2(0.0);
      float amount=.012;
      if (mode < .5) { // VEIL — 薄い膜・残像・呼吸
        amount=.011;
        motion=f*1.5+vec2(sin(uv.y*5.1+t*.17+phase),cos(uv.x*3.5-t*.13))*.13;
      } else if (mode < 1.5) { // PULSE — 輪郭を残した短い有機的な反応
        amount=.007+energy*.013;
        motion=f*.9+vec2(sin(uv.y*7.8+phase+t*.47),cos(uv.x*6.1-t*.43))*.2;
      } else if (mode < 2.5) { // CURRENT — 写真の内部で流れ続ける液体
        amount=.025;
        motion=f*2.1+vec2(sin(uv.y*4.0+t*.21+phase),cos(uv.x*4.6-t*.18+phase))*.35;
      } else { // PARTICLE — 微細な脈動と不均質な表面
        amount=.012+energy*.009;
        float ripple=sin(length(uv-vec2(.53+.12*sin(t*.08),.44+.10*cos(t*.07)))*20.-t*1.6);
        motion=f*1.3+vec2(ripple*.25,ripple*.18);
      }
      vec2 pos=clamp(uv+motion*amount,.001,.999);
      // アスペクト比を維持した cover。常に入力写真の色が主役。
      vec2 photoUv=(pos-.5)*u_fit+.5;
      vec3 col=texture2D(u_photo,photoUv).rgb;
      if (mode < .5) {
        vec3 ghost=texture2D(u_photo,(uv+motion*amount*.35-.5)*u_fit+.5).rgb;
        col=mix(col,ghost,.085+.04*sin(t*.12));
      }
      float atmosphere=fbm(uv*2.1+vec2(t*.023,9.+phase));
      float light=(atmosphere-.5)*(.065+energy*.03);
      col=clamp(col+vec3(light*.86,light,light*.91),0.,1.);
      // 画像の本来の彩度を残したまま、薄い明度変化だけ加える。
      gl_FragColor=vec4(col,1.0);
    }`;

  class PhotoRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.imageAspect = 1;
      this.playing = false;
      this.engine = 0;
      this.energy = 0;
      this.seed = .5;
      this.t = 0;
      this.previous = 0;
      this.hasPhoto = false;
      this.isWebGL = false;
      this.gl = null;
      this.image = null;
      try { this.initializeGL(); }
      catch(err) {
        console.warn('WebGL unavailable; switching to 2D fallback',err);
        // WebGL確保後のコンパイル失敗でも復旧するよう、必要ならcanvasを作り直す。
        this.gl = null; this.ctx = canvas.getContext('2d');
        if(!this.ctx){
          const replacement=canvas.cloneNode(false); canvas.replaceWith(replacement);
          this.canvas=replacement;this.ctx=replacement.getContext('2d');
        }
      }
      this.resize();
      window.addEventListener('resize',()=>this.resize(),{passive:true});
      requestAnimationFrame(t=>this.frame(t));
    }
    initializeGL(){
      const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
      if(!gl) throw Error('No WebGL');
      const shader=(type,src)=>{
        const sh=gl.createShader(type); gl.shaderSource(sh,src); gl.compileShader(sh);
        if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      const pr=gl.createProgram();
      gl.attachShader(pr,shader(gl.VERTEX_SHADER,VERTEX));
      gl.attachShader(pr,shader(gl.FRAGMENT_SHADER,FRAGMENT));
      gl.linkProgram(pr);
      if(!gl.getProgramParameter(pr,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(pr,'a_position'); gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      this.uniforms={}; ['u_time','u_energy','u_seed','u_engine','u_fit','u_photo'].forEach(n=>this.uniforms[n]=gl.getUniformLocation(pr,n));
      const tex=gl.createTexture();this.texture=tex;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([25,39,36,255]));
      gl.uniform1i(this.uniforms.u_photo,0);
      this.gl=gl;this.isWebGL=true;
    }
    resize(){
      const box=this.canvas.getBoundingClientRect();
      if(!box.width||!box.height)return;
      // GPU帯域を保護する。保存PNGもこのキャンバス解像度。
      const scale=Math.min(window.devicePixelRatio||1,1.2,620/Math.max(box.width,box.height));
      const w=Math.max(1,Math.round(box.width*scale));const h=Math.max(1,Math.round(box.height*scale));
      this.canvas.width=w;this.canvas.height=h;
      if(this.gl)this.gl.viewport(0,0,w,h);
      this.fitPhoto();
      if(!this.gl&&this.image)this.prepare2D();
      if(this.hasPhoto)this.render();
    }
    fitPhoto(){
      if(!this.gl) return;
      const view=this.canvas.width/this.canvas.height;
      const pic=this.imageAspect;
      const fit=view>pic ? [1,pic/view] : [view/pic,1];
      this.gl.uniform2f(this.uniforms.u_fit,fit[0],fit[1]);
    }
    setPhoto(image){
      this.image=image;
      this.imageAspect=image.width/image.height;
      this.hasPhoto=true;
      if(this.gl){
        const gl=this.gl;
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        this.fitPhoto();
      }else this.prepare2D();
      this.render();
    }
    // WebGLが使えない端末向け。格子状タイルは描画せず、連続変位をピクセルへ適用する。
    prepare2D(){
      if(!this.ctx||!this.image)return;
      const c=this.canvas,w=c.width,h=c.height,img=this.image;
      const src=document.createElement('canvas');src.width=w;src.height=h;
      const g=src.getContext('2d',{willReadFrequently:true});
      const scale=Math.max(w/img.width,h/img.height);
      g.drawImage(img,(w-img.width*scale)/2,(h-img.height*scale)/2,img.width*scale,img.height*scale);
      this.sourcePixels=g.getImageData(0,0,w,h).data;
      this.framePixels=this.ctx.createImageData(w,h);
    }
    setMood(index,seed){this.engine=index;this.seed=(seed%100000)/100000;this.t=0;this.render();}
    frame(stamp){
      if (!this.previous) this.previous=stamp;
      const dt=Math.min(.07,(stamp-this.previous)/1000);this.previous=stamp;
      // 動きを止める場合でも低頻度更新。再生中は24fpsに制限する。
      const interval=this.gl?41:67;
      if(!this.lastDraw||stamp-this.lastDraw>interval){
        this.lastDraw=stamp;
        this.t+=this.playing?dt:dt*.23;
        this.render();
      }
      requestAnimationFrame(t=>this.frame(t));
    }
    render(){
      if(!this.hasPhoto)return;
      if(this.gl){
        const gl=this.gl;gl.useProgram(gl.getParameter(gl.CURRENT_PROGRAM));
        gl.uniform1f(this.uniforms.u_time,this.t);
        gl.uniform1f(this.uniforms.u_energy,this.energy);
        gl.uniform1f(this.uniforms.u_seed,this.seed);
        gl.uniform1f(this.uniforms.u_engine,this.engine);
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      } else if(this.ctx&&this.image&&this.sourcePixels){
        const w=this.canvas.width,h=this.canvas.height;
        const src=this.sourcePixels, dst=this.framePixels.data;
        // sin/cosは粗い制御格子でのみ計算し、画素間は連続補間する。
        const cell=28,gw=Math.ceil(w/cell)+2,gh=Math.ceil(h/cell)+2;
        const dx=new Float32Array(gw*gh),dy=new Float32Array(gw*gh);
        const amp=([2.8,3.4,8.5,5.0][this.engine])*(1+this.energy*.45);
        for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
          const x=gx*cell/w,y=gy*cell/h,t=this.t;
          const i=gy*gw+gx;
          dx[i]=amp*(.55*Math.sin(y*7.2+t*.28+this.seed*4)+.45*Math.cos(x*7.6+y*3.4-t*.19));
          dy[i]=amp*(.58*Math.cos(x*5.3-t*.23)+.42*Math.sin(y*6.6+x*2.1+t*.15));
        }
        for(let y=0;y<h;y++){
          const gy=Math.floor(y/cell),fy=(y%cell)/cell,row=y*w;
          for(let x=0;x<w;x++){
            const gx=Math.floor(x/cell),fx=(x%cell)/cell;
            const p=gy*gw+gx,q=p+gw;
            const xTop=dx[p]+(dx[p+1]-dx[p])*fx;
            const xBottom=dx[q]+(dx[q+1]-dx[q])*fx;
            const yTop=dy[p]+(dy[p+1]-dy[p])*fx;
            const yBottom=dy[q]+(dy[q+1]-dy[q])*fx;
            const sx=Math.max(0,Math.min(w-1,Math.round(x+xTop+(xBottom-xTop)*fy)));
            const sy=Math.max(0,Math.min(h-1,Math.round(y+yTop+(yBottom-yTop)*fy)));
            const a=(row+x)*4,b=(sy*w+sx)*4;
            dst[a]=src[b];dst[a+1]=src[b+1];dst[a+2]=src[b+2];dst[a+3]=255;
          }
        }
        this.ctx.putImageData(this.framePixels,0,0);
      }
    }
    async pngBlob(){
      this.render();
      return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG creation failed')),'image/png'));
    }
  }
  root.NWVisual=PhotoRenderer;
})(window);
