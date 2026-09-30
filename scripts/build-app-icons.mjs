import sharp from 'sharp';
// Package the approved supplied logo into application icons without redrawing it.
for (const size of [192,512]) {
  await sharp('public/leeway-approved-logo.jpg').extract({left:245,top:28,width:530,height:510}).resize(size,size,{fit:'contain',background:'#f5fafb'}).png().toFile(`public/icon-${size}.png`);
  const inset=Math.round(size*.18),inner=size-2*inset;
  const mark=await sharp('public/leeway-approved-logo.jpg').extract({left:245,top:28,width:530,height:510}).resize(inner,inner,{fit:'contain',background:'#f5fafb'}).png().toBuffer();
  await sharp({create:{width:size,height:size,channels:4,background:'#f5fafb'}}).composite([{input:mark,gravity:'centre'}]).png().toFile(`public/icon-maskable-${size}.png`);
}
