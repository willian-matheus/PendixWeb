function a(r,t){try{const e=localStorage.getItem(r);return e?JSON.parse(e):t}catch{return t}}function o(r,t){localStorage.setItem(r,JSON.stringify(t))}export{a as r,o as w};
