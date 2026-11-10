'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('Резервный комплект соответствует публикуемым HTML/CSS/JS',()=>{
 const root=path.join(__dirname,'..','widget');
 const bundle=JSON.parse(fs.readFileSync(path.join(root,'BUNDLE.json'),'utf8'));
 for(const [key,file] of [['html','HTML.html'],['css','CSS.css'],['js','JS.js']])assert.equal(bundle[key],fs.readFileSync(path.join(root,file),'utf8'),'Выполните npm run build:bundle');
});
