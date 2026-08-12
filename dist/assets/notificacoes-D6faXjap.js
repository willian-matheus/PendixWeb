<<<<<<<< HEAD:dist/assets/notificacoes-BC009ugd.js
import{c}from"./createLucideIcon-BUeOXn8O.js";import{r as n,w as d}from"./localStore-BRYE5mF-.js";/**
========
import{c}from"./createLucideIcon-WsjLCUVF.js";import{r as n,w as d}from"./localStore-BRYE5mF-.js";/**
>>>>>>>> 1e67994b978ade7730fb6d82da73f72cb487abf0:dist/assets/notificacoes-D6faXjap.js
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r=[["path",{d:"M10.268 21a2 2 0 0 0 3.464 0",key:"vwvbt9"}],["path",{d:"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",key:"11g9vi"}]],p=c("bell",r),o="pendix_mock_notificacoes_v1",s=[{id:"notif-seed-1",tipo:"pendencia_vencida",titulo:"Pendência vencida",descricao:'O documento "Extrato Bancário" de Grupo Vitória Comércio Ltda venceu ontem.',lida:!1,created_at:new Date(Date.now()-2*36e5).toISOString()},{id:"notif-seed-2",tipo:"pendencia_proxima",titulo:"Pendência próxima do vencimento",descricao:'"Folha de Pagamento" vence em 2 dias.',lida:!1,created_at:new Date(Date.now()-5*36e5).toISOString()},{id:"notif-seed-3",tipo:"cliente_respondeu",titulo:"Cliente respondeu",descricao:"Nortech Soluções Industriais S.A. respondeu à cobrança enviada por WhatsApp.",lida:!1,created_at:new Date(Date.now()-26*36e5).toISOString()},{id:"notif-seed-4",tipo:"documento_recebido",titulo:"Documento recebido",descricao:'"Nota Fiscal" de Grupo Vitória Comércio Ltda foi recebido e está em análise.',lida:!0,created_at:new Date(Date.now()-3*864e5).toISOString()}];function t(){return n(o,s)}function i(e){d(o,e)}async function m(){return[...t()].sort((e,a)=>a.created_at.localeCompare(e.created_at))}async function f(e){i(t().map(a=>a.id===e?{...a,lida:!0}:a))}async function _(){i(t().map(e=>({...e,lida:!0})))}export{p as B,_ as a,m as g,f as m};
