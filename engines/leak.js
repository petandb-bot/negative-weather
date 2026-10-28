"use strict";
// LEAK: fully isolated fragment source, shader utility library, uniforms and recipe.
// Editing this module cannot change the shader source or randomization of other engines.
(() => {
const UTILS = `
precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uAmount;
uniform float uChance;
uniform float uPreserve;
uniform float uSeed;
uniform vec4 uH0;
uniform vec4 uH1;
uniform vec4 uH2;
uniform vec4 uR0;
uniform vec4 uR1;
uniform vec4 uR2;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;

float sat(float x){return clamp(x,0.0,1.0);} 
vec3 sat3(vec3 x){return clamp(x,0.0,1.0);} 
float lum(vec3 c){return dot(c, vec3(0.2126,0.7152,0.0722));}
vec2 clampUV(vec2 uv){return clamp(uv, vec2(0.0), vec2(1.0));} 
float outside(vec2 uv){vec2 c=clampUV(uv);return max(abs(uv.x-c.x),abs(uv.y-c.y));} 
vec3 texM(vec2 uv){return texture2D(uTex, clampUV(uv)).rgb;} 
vec2 screenUV(){vec2 uv=gl_FragCoord.xy/max(uResolution,vec2(1.0));uv.y=1.0-uv.y;return uv;} 
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);} 
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);} 
float fbm4(vec2 p){float v=0.0,a=0.52;mat2 m=mat2(1.57,1.11,-1.11,1.57);for(int i=0;i<4;i++){v+=a*noise2(p);p=m*p+13.71;a*=0.5;}return v;} 
float fbm6(vec2 p){float v=0.0,a=0.54;mat2 m=mat2(1.72,1.20,-1.20,1.72);for(int i=0;i<6;i++){v+=a*noise2(p);p=m*p+17.31;a*=0.52;}return v;} 
float ridge(float x){return 1.0-abs(2.0*x-1.0);} 
vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;} 
vec3 screenBlend(vec3 a, vec3 b){return 1.0-(1.0-a)*(1.0-b);} 
vec3 softLight(vec3 a, vec3 b){return mix(sqrt(max(a,0.0))*(2.0*b-1.0)+2.0*a*(1.0-b),2.0*a*b+a*a*(1.0-2.0*b),step(b,vec3(0.5)));}

vec3 satAdjust(vec3 c, float s){float y=lum(c);return mix(vec3(y), c, s);} 
vec3 hueRotate(vec3 c, float a){
  float s=sin(a), co=cos(a);
  mat3 m = mat3(
    0.213+0.787*co-0.213*s, 0.715-0.715*co-0.715*s, 0.072-0.072*co+0.928*s,
    0.213-0.213*co+0.143*s, 0.715+0.285*co+0.140*s, 0.072-0.072*co-0.283*s,
    0.213-0.213*co-0.787*s, 0.715-0.715*co+0.715*s, 0.072+0.928*co+0.072*s
  );
  return clamp(m*c,0.0,1.5);
}
vec3 splitTone(vec3 c, vec3 shad, vec3 high, float strength){
  float y=lum(c);
  float shadowMask = 1.0-smoothstep(0.16,0.66,y);
  float highMask = smoothstep(0.42,1.0,y);
  vec3 outc = c;
  outc = mix(outc, outc * mix(vec3(1.0), shad, 0.68), strength * shadowMask);
  outc = screenBlend(outc, high * highMask * strength * 0.28);
  return outc;
}
vec3 paletteWash(vec3 c, vec3 a, vec3 b, vec3 d, float strength){
  float y=lum(c);
  vec3 tint = mix(a, b, smoothstep(0.12,0.72,y));
  tint = mix(tint, d, smoothstep(0.72,1.0,y));
  vec3 washed = c * mix(vec3(1.0), tint, 0.42*strength) + tint * (0.04 + 0.06*strength);
  return mix(c, washed, strength);
}
vec3 contrastSat(vec3 c, float contrast, float satBoost){
  c = clamp((c-0.5)*(1.0+contrast)+0.5,0.0,1.2);
  return satAdjust(c, satBoost);
}
vec3 preserveSource(vec3 base, vec3 processed){float k=sat(uPreserve);k=k*k*(3.0-2.0*k);float yp=max(lum(processed),0.002), yb=max(lum(base),0.016);vec3 src=clamp(base*(yp/yb),0.0,1.3);vec3 pc=processed-vec3(yp);vec3 sc=src-vec3(lum(src));return clamp(vec3(yp)+mix(pc,sc,k),0.0,1.35);} 
vec3 softShoulder(vec3 c){return c/(vec3(1.0)+max(c-vec3(0.72),vec3(0.0))*0.96);} 
float edge(vec2 uv,float px){vec2 dx=vec2(px,0.0), dy=vec2(0.0,px);float ex=abs(lum(texM(uv+dx))-lum(texM(uv-dx)));float ey=abs(lum(texM(uv+dy))-lum(texM(uv-dy)));return sat((ex+ey)*2.2);} 
float subjectGuard(vec2 uv, vec3 base){vec2 p=uv-0.5;float center=exp(-dot(p*vec2(1.06,1.28),p*vec2(1.06,1.28))*3.6);float detail=edge(uv,1.2/max(min(uResolution.x,uResolution.y),1.0));float mid=smoothstep(0.06,0.46,lum(base))*(1.0-smoothstep(0.62,0.98,lum(base)));return sat(center*(0.30+0.70*detail)*mid);} 
vec3 triPalette(float t){return clamp(0.56+0.44*cos(6.2831853*(fract(t)+vec3(0.0,0.33,0.67))),0.0,1.0);} 
float lineGlow(vec2 p, float angle, float offset, float width){vec2 q=rot2(p, angle);return exp(-pow(abs(q.y-offset)/(width+0.0001), 1.45));}
float ringField(vec2 uv, vec2 c, float radius, float thickness){float d=abs(length(uv-c)-radius);return exp(-d*d/max(thickness*thickness,0.00001));}
vec3 hsvShiftLike(vec3 c, float shift){
  float y = lum(c);
  vec3 a = vec3(y);
  vec3 b = triPalette(y + shift);
  return mix(c, mix(a,b,0.72), 0.35);
}
`;
const FRAGMENT = UTILS + `
// Variable-density optical leak / chromogenic film response.
// A single edge-oriented light field drives three related responses:
// dye saturation, selective loss of the latent image and photographic halation.
// It is never composited as an opaque geometric shape.
float leakFalloff(float d, float reach){
  float x=max(d,0.0)/max(reach,0.10);
  return exp(-1.12*pow(x,1.62));
}
void main(){
  vec2 uv=screenUV();
  vec2 p=uv-0.5;
  vec3 base=texM(uv);
  float amt=uAmount;
  float chance=uChance;
  float family=floor(uR2.w*5.0);

  vec2 anchor, tangent, inward;
  if(family<1.0){
    anchor=vec2(mix(0.25,0.75,uH0.x),-0.07);
    tangent=vec2(1.0,0.0);inward=vec2(0.0,1.0);
  }else if(family<2.0){
    anchor=vec2(mix(0.25,0.75,uH0.x),1.07);
    tangent=vec2(1.0,0.0);inward=vec2(0.0,-1.0);
  }else if(family<3.0){
    anchor=vec2(-0.07,mix(0.25,0.75,uH0.x));
    tangent=vec2(0.0,1.0);inward=vec2(1.0,0.0);
  }else if(family<4.0){
    anchor=vec2(1.07,mix(0.25,0.75,uH0.x));
    tangent=vec2(0.0,1.0);inward=vec2(-1.0,0.0);
  }else{
    anchor=vec2(mix(0.12,0.55,uH0.x),-0.08);
    tangent=normalize(vec2(0.91,0.42));
    inward=normalize(vec2(-0.42,0.91));
  }

  vec2 domain=rot2(p,(uR0.x-0.5)*0.80);
  float broad=fbm4(domain*1.8+vec2(7.0,uSeed*0.017));
  float medium=fbm4(rot2(p,0.8)*4.1+vec2(uSeed*0.031,26.2));
  float fine=noise2(p*8.5+vec2(59.0,uSeed*0.053));
  float pores=fbm4(p*6.4+vec2(uSeed*0.042,43.2));
  vec2 rel=uv-anchor;
  float depth=dot(rel,inward);
  float sideways=dot(rel,tangent);

  // Disturb the reach over wide distances, not by drawing wobbly polygons.
  float travel=depth+(broad-0.54)*(0.26+0.17*chance)
                    +(medium-0.51)*(0.07+0.10*chance);
  float reach=mix(0.52,0.88,uH0.y);
  float exposure=leakFalloff(travel,reach);
  float across=sideways+(medium-0.5)*0.16;
  exposure*=1.0-0.21*smoothstep(0.45,1.10,abs(across));
  exposure*=0.81+0.27*broad+0.19*medium;
  // Inhomogeneous density and two weak irregular emulsion blooms.
  float cloud=0.18+0.82*smoothstep(0.23,0.76,pores);
  exposure*=mix(0.81,1.15,cloud);
  exposure=clamp(exposure*(0.88+0.63*amt),0.0,1.55);

  // Separate spatially related phases: dense filter near the source,
  // revealed photograph in the middle, and pale exposed highlights.
  float density=smoothstep(0.12,1.07,exposure);
  float saturation=smoothstep(0.05,0.70,exposure);
  float localLuma=lum(base);
  // Local halos respect photographic brightness, rather than overlaying a disc.
  vec2 d=vec2(0.010,0.015);
  float softScene=(lum(texM(uv+vec2(d.x,0.0)))+
                   lum(texM(uv-vec2(d.x,0.0)))+
                   lum(texM(uv+vec2(0.0,d.y)))+
                   lum(texM(uv-vec2(0.0,d.y))))*0.25;
  float luminous=smoothstep(0.18,0.89,0.61*localLuma+0.39*softScene);
  float edgeOfBurn=smoothstep(0.14,0.43,exposure)*
                   (1.0-smoothstep(0.73,1.21,exposure));
  float wet=0.73+0.28*broad+0.20*medium;

  // Dyes selected by MUTATE: one family per exposure, no shared pastel palette.
  vec3 dye=mix(uC0,uC1,0.44+0.47*density);
  dye=mix(dye,uC2,0.06+0.11*fine);
  // Dense film stain is strongly chromatic, not a pale RGB overlay.
  // Spatially modulated scene luminance preserves photographic structure.
  vec3 dyed=dye*(0.22+0.47*density+0.31*localLuma)
             +base*(0.045+0.12*(1.0-density));
  float deposit=saturation*(0.56+0.44*amt)*wet;
  vec3 outc=mix(base,dyed,clamp(deposit,0.0,0.97));

  // At the edge of exposure, emulsion clears and bright objects bloom.
  // Photo-linked white breakouts keep the scene legible while visible light
  // spreads irregularly across it, not as a single flat saturated block.
  float lift=edgeOfBurn*(0.14+0.43*luminous)
             *(0.31+0.46*amt)*(0.65+0.35*chance);
  vec3 pale=mix(uC2,vec3(1.0),0.74+0.20*luminous);
  outc=mix(outc,pale,clamp(lift,0.0,0.70));

  // Broad overexposure that breaks through the dye. Its position follows
  // the same incoming light direction, with nonperiodic density drift.
  float center=mix(0.29,0.67,uH1.x);
  float width=mix(0.17,0.32,uH1.y);
  float drift=(broad-0.52)*0.23+(medium-0.50)*0.095;
  float bloomCross=exp(-pow(abs(depth-center+drift)/width,2.0));
  float flareSide=uR1.z>0.5 ? sideways : -sideways;
  float asymmetry=smoothstep(-0.46,0.81,flareSide+(medium-0.5)*0.21);
  float whiteBreak=bloomCross*smoothstep(0.17,0.56,exposure)
                  *(0.32+0.55*amt)*(0.47+0.53*luminous)
                  *(0.75+0.25*medium)*mix(0.66,1.48,asymmetry);
  outc=mix(outc,mix(pale,vec3(1.0),0.78),
           clamp(whiteBreak,0.0,0.85));

  float hotHighlights=smoothstep(0.45,0.91,
                          0.60*localLuma+0.40*softScene);
  float bloom=saturation*hotHighlights*(0.035+0.12*amt)*
              (0.64+0.36*medium);
  outc=screenBlend(outc,pale*bloom);

  // Patches of dye fade continuously into the original latent image.
  float recovery=(1.0-density)*smoothstep(0.31,0.72,medium)
                  *(0.12+0.19*chance);
  outc=mix(outc,base,recovery);
  float grain=(hash21(floor(uv*uResolution)+uSeed*37.0)-0.5)*
              (0.004+0.009*amt);
  outc+=vec3(grain);
  outc=mix(base,outc,smoothstep(0.0,0.11,amt));
  outc=preserveSource(base,outc);
  outc=mix(outc,softShoulder(outc),0.28);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;
const PALETTES = [
  {name:'SCARLET FLOOD', c0:[0.42,0.010,0.016], c1:[0.98,0.025,0.018], c2:[1.00,0.68,0.44]},
  {name:'COBALT FLOOD', c0:[0.012,0.030,0.32], c1:[0.035,0.20,1.00], c2:[0.57,0.75,1.00]},
  {name:'VIRIDIAN FLOOD', c0:[0.005,0.20,0.095], c1:[0.015,0.79,0.32], c2:[0.62,1.00,0.64]},
  {name:'VIOLET FLOOD', c0:[0.24,0.012,0.34], c1:[0.70,0.035,0.97], c2:[0.95,0.61,1.00]},
  {name:'CYAN FLOOD', c0:[0.006,0.24,0.28], c1:[0.00,0.82,0.96], c2:[0.58,0.97,1.00]},
  {name:'AMBER FLOOD', c0:[0.46,0.13,0.006], c1:[1.00,0.49,0.012], c2:[1.00,0.88,0.48]},
  {name:'MAGENTA FLOOD', c0:[0.36,0.004,0.17], c1:[1.00,0.04,0.48], c2:[1.00,0.63,0.77]},
  {name:'ACID FLOOD', c0:[0.28,0.32,0.008], c1:[0.84,0.96,0.015], c2:[0.99,1.00,0.57]}
];
const FAMILIES = ['UPPER FLOOD','LOWER FLOOD','LEFT FLOOD','RIGHT FLOOD','DOUBLE FLOOD'];
function makeRecipe(previous){
 const r=Math.random;
 let pi=Math.floor(r()*PALETTES.length);
 if(previous && PALETTES[pi].name === previous.palette)
   pi=(pi+1+Math.floor(r()*(PALETTES.length-1)))%PALETTES.length;
 const p=PALETTES[pi];
 const fi=Math.floor(r()*FAMILIES.length);
 const result={seed:r()*99,h0:[r(),r(),r(),r()],h1:[r(),r(),r(),r()],h2:[r(),r(),r(),r()],
  r0:[r(),r(),r(),r()],r1:[r(),r(),r(),r()],r2:[r(),r(),r(),r()],
  c0:p.c0,c1:p.c1,c2:p.c2,palette:p.name,family:FAMILIES[fi],id:Math.floor(1+r()*98)};
 result.r2[3]=(fi+0.18+r()*0.54)/FAMILIES.length;
 return result;
}
function setUniforms(target, source, width, height, params, recipe){
  target.setUniform('uTex', source);
  target.setUniform('uResolution', [width,height]);
  target.setUniform('uAmount', params.amount/100);
  target.setUniform('uChance', params.chance/100);
  target.setUniform('uPreserve', params.preserve/100);
  target.setUniform('uSeed', recipe.seed);
  for (const key of ['h0','h1','h2','r0','r1','r2']) target.setUniform('u'+key.toUpperCase(), recipe[key]);
  target.setUniform('uC0', recipe.c0);
  target.setUniform('uC1', recipe.c1);
  target.setUniform('uC2', recipe.c2);
}
window.IAEngines = window.IAEngines || Object.create(null);
window.IAEngines.LEAK = Object.freeze({fragment:FRAGMENT,makeRecipe,setUniforms});
})();
