"use strict";
// CHEMICAL: fully isolated fragment source, shader utility library, uniforms and recipe.
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
void main(){
  vec2 uv = screenUV();
  vec2 p = uv - 0.5;
  vec3 base = texM(uv);
  float amt = uAmount, ch = uChance;
  float guard = subjectGuard(uv, base);

  // All chemical structures are continuous 2D fields. There are no vertical
  // slit masks, half-frame divisions or scanline-dependent color branches.
  vec2 k0 = rot2(p, (uR0.x-0.5)*1.35);
  vec2 k1 = rot2(p, (uR0.y-0.5)*1.62);
  float bathA = fbm6(k0*2.8 + vec2(7.0,uSeed*0.017));
  float bathB = fbm4(k1*5.5 + vec2(uSeed*0.020,19.0));
  float salt = fbm4(rot2(p,0.86)*4.2 + vec2(31.0,uSeed*0.022));

  // Slowly changing dye and developer densities; broad ramps prevent
  // straight boundaries and the abrupt mid-frame 'cut' of the old result.
  float developer = smoothstep(0.23,0.77,bathA*0.82+bathB*0.27);
  float dyeLoss   = smoothstep(0.26,0.80,salt*0.76+bathB*0.28);
  float bleach    = smoothstep(0.49,0.92,bathA*0.34+bathB*0.68);
  float stain     = sat(developer*0.70+dyeLoss*0.38);

  vec2 drift = vec2(
    fbm4(p*1.95 + vec2(uSeed*0.011,4.0))-0.5,
    fbm4(rot2(p,1.07)*2.10 + vec2(17.0,uSeed*0.014))-0.5
  );
  drift *= (0.64+0.36*(1.0-guard));
  vec3 rS = texM(uv+drift*0.009*(0.20+amt)*vec2(1.0,0.8));
  vec3 gS = texM(uv+drift*0.007*(0.18+amt)*vec2(-0.7,1.0));
  vec3 bS = texM(uv+drift*0.011*(0.16+ch)*vec2(0.9,-0.6));
  vec3 layer = vec3(rS.r,gS.g,bS.b);
  vec3 cross = vec3(layer.g*0.82+layer.r*0.20,
                    layer.b*0.74+layer.g*0.26,
                    layer.r*0.78+layer.b*0.18);

  vec3 spectral = mix(triPalette(bathA*0.62+uR1.x),
                      mix(uC0,uC2,0.52),0.36);
  vec3 chem = mix(base,cross,developer*(0.27+0.39*amt)*(1.0-0.15*guard));
  chem = mix(chem,spectral*(0.78+0.29*lum(layer)),
             dyeLoss*(0.12+0.24*ch));
  chem = mix(chem,vec3(0.99,0.97,0.91),
             bleach*(0.045+0.145*amt)*(1.0-lum(base)*0.30));

  // Fine emulsion response, never a high-contrast geometry outline.
  float edgeField = edge(uv,1.0/max(uResolution.x,1.0));
  chem = screenBlend(chem,mix(uC1,vec3(1.0,0.95,0.89),0.43)
                       *edgeField*stain*(0.035+0.085*amt));
  vec3 residue = mix(uC0,uC2,smoothstep(0.20,0.82,bathB));
  chem = mix(chem,chem*mix(vec3(1.0),residue,0.22),
             stain*(0.20+0.22*ch));
  chem = mix(chem,hsvShiftLike(chem,bathB*0.24+uR1.z*0.30),
             0.11+0.18*amt);

  float sediment = pow(hash21(floor(uv*uResolution*0.14)+uSeed*11.0),15.0)
                   *stain*0.065*amt;
  chem = mix(chem,vec3(0.96,0.93,0.86),sediment);
  chem += vec3((hash21(floor(uv*uResolution)+uSeed*31.0)-0.5)
               *(0.006+0.009*amt));

  chem = preserveSource(base,chem);
  vec3 tone = paletteWash(chem,mix(uC0,vec3(0.92,0.82,0.74),0.32),
                          mix(uC1,uC2,0.46),vec3(1.0,0.99,0.96),
                          0.31+0.28*amt);
  tone = splitTone(tone,mix(uC0,uC2,0.48),
                   mix(uC1,vec3(1.0),0.40),0.16+0.19*ch);
  tone = hueRotate(tone,(uR0.x-0.5)*0.23+(bathB-0.5)*0.10);
  tone = contrastSat(tone,0.065+0.10*amt,1.10+0.14*amt);
  chem = mix(chem,tone,0.46+0.23*amt);
  chem = softShoulder(chem);
  gl_FragColor=vec4(clamp(chem,0.0,1.0),1.0);
}`;
const PALETTES = [
  {name:'EMBER FILM', c0:[0.95,0.58,0.32], c1:[1.00,0.85,0.55], c2:[0.98,0.48,0.66]},
  {name:'MINT BATH', c0:[0.55,0.84,0.67], c1:[0.74,0.92,0.88], c2:[0.90,0.98,0.96]},
  {name:'LILAC SHIFT', c0:[0.64,0.56,0.88], c1:[0.82,0.72,0.98], c2:[0.96,0.90,1.00]},
  {name:'SODIUM GLASS', c0:[0.90,0.66,0.30], c1:[0.94,0.82,0.55], c2:[0.74,0.88,0.96]},
  {name:'CYAN DUST', c0:[0.48,0.76,0.92], c1:[0.78,0.84,1.00], c2:[0.96,0.76,0.98]},
  {name:'PALE SILVER', c0:[0.72,0.76,0.80], c1:[0.90,0.92,0.95], c2:[0.99,0.97,0.94]}
];
const FAMILIES = ['BLEACH BATH','DYE FAILURE','DEVELOPER SURGE','CROSS BATH','SILVER RESIDUE'];
function makeRecipe(){
 const r=Math.random;
 const p=PALETTES[Math.floor(r()*PALETTES.length)];
 const family=FAMILIES[Math.floor(r()*FAMILIES.length)];
 return {seed:r()*99,h0:[r(),r(),r(),r()],h1:[r(),r(),r(),r()],h2:[r(),r(),r(),r()],
  r0:[r(),r(),r(),r()],r1:[r(),r(),r(),r()],r2:[r(),r(),r(),r()],
  c0:p.c0,c1:p.c1,c2:p.c2,palette:p.name,family,id:Math.floor(1+r()*98)};
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
window.IAEngines.CHEMICAL = Object.freeze({fragment:FRAGMENT,makeRecipe,setUniforms});
})();
