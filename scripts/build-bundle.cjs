'use strict';
// Обновлять перед публикацией любых изменений HTML/CSS/JS.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..','widget');
const assets=Object.fromEntries([['html','HTML.html'],['css','CSS.css'],['js','JS.js']].map(([key,file])=>[key,fs.readFileSync(path.join(root,file),'utf8')]));
// Для резервного комплекта commit — идентификатор содержимого, не Git-коммит.
const commit=crypto.createHash('sha1').update(JSON.stringify(assets)).digest('hex');
fs.writeFileSync(path.join(root,'BUNDLE.json'),JSON.stringify({formatVersion:1,commit,...assets})+'\n');
