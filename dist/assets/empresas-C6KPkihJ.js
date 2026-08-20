import{c}from"./createLucideIcon-DigP3B1a.js";import{s as o}from"./index-Cxi4tkOo.js";import{r as f,w as u}from"./localStore-CZ66K1t6.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],x=c("eye",l);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],I=c("pen",p);function s(){try{return JSON.parse(localStorage.getItem("flash_user")||"null")}catch{return null}}function i(){return localStorage.getItem("flash_impersonated_office_id")}function m(){var e;return i()||((e=s())==null?void 0:e.officeId)||"sem-escritorio"}function d(){var e;return i()||((e=s())==null?void 0:e.officeId)||null}function a(){return`pendix_mock_cliente_empresa_v1:${m()}`}function _(){var r;if(i())return!1;const e=(r=s())==null?void 0:r.role;return e==="super_admin"||e==="admin"}async function h(){let e=o.from("pendix_empresas").select("*").order("nome");if(!_()){const n=d();n&&(e=e.eq("escritorio_id",n))}const{data:r,error:t}=await e;if(t)throw t;return r??[]}async function k(e){const r=d(),{data:t,error:n}=await o.from("pendix_empresas").insert({...e,escritorio_id:e.escritorio_id||r}).select().single();if(n)throw n;return t}async function S(e,r){const{data:t,error:n}=await o.from("pendix_empresas").update({...r,updated_at:new Date().toISOString()}).eq("id",e).select().single();if(n)throw n;return t}async function E(e){const{error:r}=await o.from("pendix_empresas").delete().eq("id",e);if(r)throw r;const t=f(a(),{});for(const n of Object.keys(t))t[n]===e&&delete t[n];u(a(),t)}export{x as E,I as P,E as d,h as g,k as p,S as u};
