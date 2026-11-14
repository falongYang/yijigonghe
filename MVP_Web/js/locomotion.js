/* Six-foot tripod gait and antenna probing in the existing body draw call.
 * Shared geometry carries hinge metadata; each material owns three small uniforms. */
export function installLocomotion(material, shared = null) {
  const uniforms = shared || { antGait:{value:0}, antStride:{value:0}, antProbe:{value:1} };
  material.userData.locomotion = uniforms;
  material.customProgramCacheKey = () => 'ant-tripod-v1';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader = `attribute vec4 antHinge;
uniform float antGait;
uniform float antStride;
uniform float antProbe;
mat3 antTurn() {
  float angle = 0.0;
  if (antHinge.w > 0.5 && antHinge.w < 2.5) angle = sin(antGait * 6.2831853 + (antHinge.w - 1.0) * 3.14159265) * 0.32 * antStride;
  if (antHinge.w > 2.5) angle = sin(antGait * 1.8 + antHinge.w) * 0.16 * antProbe;
  float c = cos(angle), s = sin(angle);
  return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c);
}
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = antTurn() * objectNormal;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = antTurn() * (transformed - antHinge.xyz) + antHinge.xyz;\nif (antHinge.w > 0.5 && antHinge.w < 2.5) transformed.y += max(0.0, sin(antGait * 6.2831853 + (antHinge.w - 1.0) * 3.14159265)) * 0.13 * antStride * min(1.0, length(position.xz - antHinge.xz));');
  };
  return uniforms;
}
export function updateLocomotion(material, unit, time) {
  const v=material?.userData?.locomotion;if(!v)return;
  v.antGait.value=Number.isFinite(unit.feel?.gait)?unit.feel.gait:time*.25;
  v.antStride.value=unit.moving&&unit.hp>0&&!(unit.stunT>0)?(unit.domain==='sea'?.55:unit.domain==='air'?.18:1):0;
  v.antProbe.value=unit.hp<=0||unit.stunT>0?0:unit.state==='harvest'?1.7:unit.state==='attack'?.45:1;
}
