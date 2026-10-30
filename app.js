(function () {
  'use strict';
  const C = window.ColorEngine;
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const STORAGE_KEY = 'chroma-studio-v1';
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { /* Private browsing and malformed storage are safe defaults. */ }
  if (typeof stored !== 'object' || Array.isArray(stored)) stored = {};
  const validPalette = p => p && Array.isArray(p.colors) && p.colors.length >= 2 && p.colors.length <= 6 && p.colors.every(c => /^#[\da-f]{6}$/i.test(c));
  const state = {
    base:C.normalizeHex(stored.base || '') || '#75689B', hsv:[0,0,0], picker:'wheel', relation:'analogous', page:'explore',
    count:[2,3,4,5,6].includes(stored.count) ? stored.count : 5,
    effect:Object.hasOwn(C.effectLabels,stored.effect) ? stored.effect : 'harmony',
    rule:['auto','analogous','complement','split','triadic','tetradic','mono'].includes(stored.rule) ? stored.rule : 'auto',
    lock:stored.lock !== false, view:['mixed','palette','type','gradient','ui'].includes(stored.view) ? stored.view : 'mixed',
    theme:['light','dark'].includes(stored.theme) ? stored.theme : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    seed:1024, palettes:[], favorites:Array.isArray(stored.favorites) ? stored.favorites.filter(validPalette).map(({name, ...p}) => ({...p,colors:p.colors.map(C.normalizeHex),id:p.colors.map(C.normalizeHex).join('').replaceAll('#','')})) : [],
  };
  state.hsv = C.rgbToHsv(C.hexToRgb(state.base));
  let selectedPalette = null, exportFormat = 'css', exported = null, renderTimer = 0, toastTimer = 0, lastFocusedElement = null;
  let channelValues = [], channelMode = '', storageNoticeShown = false;
  function persist() {
    const {base,count,effect,rule,lock,view,theme,favorites} = state;
    try { localStorage.setItem(STORAGE_KEY,JSON.stringify({base,count,effect,rule,lock,view,theme,favorites})); }
    catch (_) { if (!storageNoticeShown) { toast('浏览器未允许本地保存，请导出收藏留存'); storageNoticeShown = true; } }
  }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').querySelector('span').textContent = message; $('toast').classList.add('visible');
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'),2400);
  }
  async function copy(text, message = '已复制到剪贴板') {
    try { if (!navigator.clipboard?.writeText) throw new Error('fallback'); await navigator.clipboard.writeText(text); }
    catch (_) {
      const textarea = document.createElement('textarea'); textarea.value = text;
      textarea.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      const host = $$('dialog[open]')[0] || document.body; host.appendChild(textarea); textarea.focus(); textarea.select();
      let success = false;
      try { success = document.execCommand('copy'); } catch (_) { /* Keep a visible fallback below. */ }
      textarea.remove();
      if (!success) { toast(text.length < 80 ? `请手动复制：${text}` : '复制不可用，请使用下载文件'); return; }
    }
    toast(message);
  }
  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text],{type}));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url),1000); toast('已生成导出文件');
  }
  function syncControls() {
    $$('[data-count]').forEach(b => { const active = +b.dataset.count === state.count; b.classList.toggle('active',active); b.setAttribute('aria-pressed',active); });
    $$('[data-effect]').forEach(b => { const active = b.dataset.effect === state.effect; b.classList.toggle('active',active); b.setAttribute('aria-pressed',active); });
    $$('[data-view]').forEach(b => { const active = b.dataset.view === state.view; b.classList.toggle('active',active); b.setAttribute('aria-pressed',active); });
    $('harmony-select').value = state.rule; $('lock-base').checked = state.lock;
  }
  function regenerate({delay = false, previous = []} = {}) {
    clearTimeout(renderTimer);
    const run = () => { renderTimer = 0; state.palettes = C.generate({...state, previous}); renderGallery(); persist(); };
    if (delay) renderTimer = setTimeout(run,100); else run();
  }
  function advanceSeed() { state.seed = (state.seed + 1 + Math.floor(Math.random()*1e9)) >>> 0; }
  function setBase(hex, hsv = null, delay = false) {
    state.base = C.normalizeHex(hex); state.hsv = hsv || C.rgbToHsv(C.hexToRgb(state.base),state.hsv[0]);
    $('hex-error').textContent = ''; $('hex-input').removeAttribute('aria-invalid');
    updatePicker(); renderRelated(); regenerate({delay});
  }
  function drawWheel() {
    const canvas = $('hue-wheel'), size = 480, ctx = canvas.getContext('2d'), center = size/2;
    ctx.clearRect(0,0,size,size); ctx.lineWidth = 30;
    for (let h=0;h<360;h++) {
      ctx.beginPath(); ctx.strokeStyle = `hsl(${h},78%,66%)`;
      ctx.arc(center,center,208,(h-90)*Math.PI/180,(h-88.5)*Math.PI/180); ctx.stroke();
    }
  }
  function updatePicker() {
    const [h,s,v] = state.hsv, radians = (h-90)*Math.PI/180;
    const marker = $('hue-marker'); marker.style.left = `${50+43.333*Math.cos(radians)}%`; marker.style.top = `${50+43.333*Math.sin(radians)}%`;
    marker.style.background = `hsl(${h},78%,66%)`; $('hue-wheel').setAttribute('aria-valuenow',Math.round(h));
    $('hue-wheel').setAttribute('aria-valuetext',`${Math.round(h)} 度`);
    $('sv-square').style.backgroundColor = `hsl(${h},100%,50%)`;
    $('sv-marker').style.left = `${s}%`; $('sv-marker').style.top = `${100-v}%`;
    $('summary-h').textContent = `${Math.round(h)}°`; $('summary-s').textContent = `${Math.round(s)}%`; $('summary-b').textContent = `${Math.round(v)}%`;
    $('hex-input').value = state.base; $('native-color').value = state.base.toLowerCase();
    if (state.picker !== 'wheel') updateChannels();
  }
  function bindPointer(element, update) {
    element.addEventListener('pointerdown',event => {
      if (event.button !== 0) return;
      event.preventDefault(); element.setPointerCapture(event.pointerId);
      update(event);
    });
    element.addEventListener('pointermove',event => { if (element.hasPointerCapture(event.pointerId)) update(event); });
    element.addEventListener('pointerup',event => { if (element.hasPointerCapture(event.pointerId)) { element.releasePointerCapture(event.pointerId); regenerate(); } });
    element.addEventListener('pointercancel',() => regenerate());
  }
  bindPointer($('hue-wheel'),event => {
    const r = $('hue-wheel').getBoundingClientRect(), dx = event.clientX-r.left-r.width/2, dy = event.clientY-r.top-r.height/2;
    const h = C.wrap(Math.atan2(dy,dx)*180/Math.PI+90), hsv = [h,state.hsv[1],state.hsv[2]];
    setBase(C.rgbToHex(C.hsvToRgb(hsv)),hsv,true);
  });
  bindPointer($('sv-square'),event => {
    const r = $('sv-square').getBoundingClientRect();
    const hsv = [state.hsv[0],C.clamp((event.clientX-r.left)/r.width)*100,(1-C.clamp((event.clientY-r.top)/r.height))*100];
    setBase(C.rgbToHex(C.hsvToRgb(hsv)),hsv,true);
  });
  $('hue-wheel').addEventListener('keydown',event => {
    const direction = {ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[event.key];
    if (!direction) return;
    event.preventDefault(); const hsv = [C.wrap(state.hsv[0]+direction*(event.shiftKey ? 10 : 1)),state.hsv[1],state.hsv[2]];
    setBase(C.rgbToHex(C.hsvToRgb(hsv)),hsv);
  });
  const channelConfigs = {
    rgb:[['R','红',255],['G','绿',255],['B','蓝',255]],
    cmyk:[['C','青',100],['M','品红',100],['Y','黄',100],['K','黑',100]],
    hsv:[['H','色相 / °',360],['S','饱和度 / %',100],['B','明度 / %',100]],
  };
  function renderChannelPanel() {
    channelMode = '';
    const config = channelConfigs[state.picker];
    if (!config) return;
    $('channel-panel').innerHTML = config.map(([key,label,max],i) => `<div class="channel-row"><label class="channel-label" for="channel-number-${i}"><b>${key}</b>${label}</label><input id="channel-number-${i}" type="number" min="0" max="${max}" step="1" data-channel="${i}" aria-label="${key} ${label}"><input id="channel-range-${i}" type="range" min="0" max="${max}" step="1" data-channel="${i}" aria-label="${key} ${label}滑块"></div>`).join('') + (state.picker==='cmyk' ? '<p class="channel-note">屏幕近似值，实际印刷效果依赖纸张和 ICC 配置。</p>' : state.picker==='hsv' ? '<p class="channel-note">HSB = HSV · 色相 / 饱和度 / 明度</p>' : '<p class="channel-note">sRGB · 适用于屏幕与数字设计</p>');
    $$('[data-channel]').forEach(input => {
      input.addEventListener('input',() => {
        if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
        const i = +input.dataset.channel; channelValues[i] = C.clamp(input.valueAsNumber,0,config[i][2]);
        const values = [...channelValues];
        const rgb = state.picker === 'rgb' ? values : state.picker === 'cmyk' ? C.cmykToRgb(values) : C.hsvToRgb(values);
        const hsv = state.picker === 'hsv' ? [C.wrap(values[0]),values[1],values[2]] : C.rgbToHsv(rgb,state.hsv[0]);
        state.base = C.rgbToHex(rgb); state.hsv = hsv;
        // Keep the user's CMYK decomposition (black generation is not unique).
        updatePickerFromChannel(input); renderRelated(); regenerate({delay:input.type==='range'});
      });
      input.addEventListener('change',() => { updateChannels(null,true); regenerate(); });
      input.addEventListener('blur',() => updateChannels(null,true));
    });
    updateChannels();
  }
  function updatePickerFromChannel(source) {
    const mode = state.picker; state.picker = 'wheel'; updatePicker(); state.picker = mode;
    updateChannels(source,true);
  }
  function updateChannels(source = null, retain = false) {
    if (channelMode !== state.picker || !retain) {
      const rgb = C.hexToRgb(state.base);
      channelValues = state.picker === 'rgb' ? rgb : state.picker === 'cmyk' ? C.rgbToCmyk(rgb) : [...state.hsv];
      channelMode = state.picker;
    }
    const config = channelConfigs[state.picker]; if (!config) return;
    config.forEach(([, ,max],i) => {
      const number = $(`channel-number-${i}`), range = $(`channel-range-${i}`);
      if (source !== number) number.value = Math.round(channelValues[i]);
      if (source !== range) range.value = Math.round(channelValues[i]);
      const ends = [0,max].map(val => {
        const values = [...channelValues]; values[i] = val;
        return C.rgbToHex(state.picker==='rgb' ? values : state.picker==='cmyk' ? C.cmykToRgb(values) : C.hsvToRgb(values));
      });
      range.style.background = state.picker==='hsv' && i===0 ? 'linear-gradient(to right,#f66,#ff6,#6f6,#6ff,#66f,#f6f,#f66)' : `linear-gradient(to right,${ends[0]},${ends[1]})`;
    });
  }
  function renderRelated() {
    const colors = C.related(state.base,state.relation);
    $('related-colors').innerHTML = colors.map(hex => `<button class="related-swatch ${hex===state.base?'is-base':''}" style="background:${hex};color:${C.textOn(hex)}" data-related="${hex}" title="${hex} · 设为基准色" aria-label="将关联色 ${hex} 设为基准色"></button>`).join('');
    const descriptions = {analogous:'相近色相的细微变化，让色彩自然地连接。',complement:'色轮另一侧的呼应，在对照中找到平衡。',triadic:'三个方向的色相，让画面丰富而有节奏。',tonal:'同一色彩的明暗层次，建立安静的秩序。'};
    $('relation-description').textContent = descriptions[state.relation];
  }
  function bestPair(colors) {
    let best = [0,1], ratio = 0;
    colors.forEach((a,i) => colors.forEach((b,j) => { const r=C.contrast(a,b); if (r>ratio) {ratio=r;best=[i,j];} }));
    return best;
  }
  function previewType(index) { return state.view === 'mixed' ? ['type','poster','gradient','ui','type','poster'][index%6] : state.view; }
  function previewHtml(palette,type,index=0) {
    const colors = [...palette.colors];
    if (type==='type') { const pair=bestPair(colors), a=colors[pair[0]], b=colors[pair[1]]; colors.splice(0,colors.length,a,b,...palette.colors.filter((_,i)=>!pair.includes(i))); }
    while (colors.length<5) colors.push(colors[colors.length%palette.colors.length]);
    const vars = colors.map((hex,i) => `--p${i}:${hex};--pt${i}:${C.textOn(hex)}`).join(';');
    if (type==='palette') return `<div class="preview preview-palette" style="${vars}">${palette.colors.map((hex,i)=>`<div style="background:${hex};color:${C.textOn(hex)}">0${i+1}</div>`).join('')}</div>`;
    if (type==='poster') return `<div class="preview preview-poster" style="${vars}"><span class="poster-number">STUDY / ${String(index+1).padStart(2,'0')}</span><div class="poster-circle"></div><div class="poster-arch"></div><div class="poster-line"></div><span class="poster-word">IN GOOD COMPANY.</span></div>`;
    if (type==='gradient') return `<div class="preview preview-gradient" style="${vars}"><span class="gradient-corner">↗</span><div class="gradient-orb"></div><span class="gradient-caption">A SOFTER PERSPECTIVE.</span></div>`;
    if (type==='ui') return `<div class="preview preview-ui" style="${vars}"><div class="mini-ui"><div class="mini-ui-nav"><span>forma.</span><span>Objects & living ↗</span></div><div class="mini-ui-main"><strong>Less, but<br>meaningful.</strong><p>Thoughtful objects.<br>A quieter way of living.</p><span class="mini-ui-button">Explore the collection ↗</span></div><div class="mini-ui-shape"></div></div></div>`;
    const titles = [['Quiet','by nature.'],['More than','a feeling.'],['Make room','for wonder.'],['Softly,','in color.']][index%4];
    return `<div class="preview preview-type" style="${vars}"><span class="preview-label">COLOR IS A WAY OF SEEING</span><div class="preview-big">${titles[0]}<span>${titles[1]}</span></div><span class="preview-foot">A SMALL STUDY IN BEAUTIFUL POSSIBILITIES.</span><span class="type-index">${String(index+1).padStart(2,'0')} ↗</span></div>`;
  }
  const isSaved = id => state.favorites.some(p => p.id === id);
  function visiblePalettes() { return state.page==='favorites' ? state.favorites : state.palettes; }
  function renderGallery() {
    const palettes = visiblePalettes();
    $('palette-grid').innerHTML = palettes.map((p,i) => `<article class="palette-card" style="animation-delay:${Math.min(i,11)*18}ms"><button class="card-art" data-detail="${p.id}" aria-label="查看配色 ${i+1} 详情">${previewHtml(p,previewType(i),i)}</button><button class="favorite-button ${isSaved(p.id)?'saved':''}" data-save="${p.id}" aria-label="${isSaved(p.id)?'取消收藏':'收藏'}配色 ${i+1}" aria-pressed="${isSaved(p.id)}" title="${isSaved(p.id)?'取消收藏':'收藏配色'}">${icon('heart')}</button><div class="palette-strip">${p.colors.map(hex => `<button style="background:${hex};color:${C.textOn(hex)}" data-copy="${hex}" title="复制 ${hex}" aria-label="复制颜色 ${hex}"><span>${hex}</span></button>`).join('')}</div><div class="card-meta"><span class="card-number">${String(i+1).padStart(2,'0')}</span><button data-detail="${p.id}" aria-label="查看配色 ${i+1} 详情"><span>${C.ruleLabels[p.rule]||'自由配色'}</span>${icon('arrow')}</button></div></article>`).join('');
    $('favorite-count').textContent = state.favorites.length;
    $('empty-state').hidden = palettes.length>0 || state.page!=='favorites';
    $('load-more').hidden = state.page==='favorites';
    $('collection-description').textContent = state.page==='favorites' ? `已收藏的 ${palettes.length} 组灵感` : `为你发现的 ${palettes.length} 组配色`;
    $('generation-label').textContent = state.page==='favorites' ? 'KEEP WHAT MOVES YOU.' : 'CURATED BY COLOR, MADE FOR YOU.';
    $('export-button').disabled = palettes.length===0;
  }
  function toggleFavorite(palette) {
    if (isSaved(palette.id)) { state.favorites=state.favorites.filter(p=>p.id!==palette.id); toast('已取消收藏'); }
    else { state.favorites.unshift({...palette,colors:[...palette.colors]}); toast('已收藏，在「我的收藏」中查看'); }
    persist(); renderGallery(); syncDetailSave();
  }
  function setPage(page) {
    state.page=page;
    $$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
    $('page-title').innerHTML=page==='favorites' ? '把喜欢的，<span>留在这里。</span>' : '让色彩，<span>恰好相遇。</span>';
    $('page-description').textContent=page==='favorites' ? '一些让你心动的色彩，等待成为下一次创作。' : '从一抹灵感出发，探索属于你的色彩秩序。';
    // Saved palettes are shown exactly as collected; generation settings belong to Explore.
    document.querySelector('.generator-controls').hidden=page==='favorites';
    $('generate-button').hidden=page==='favorites';
    renderGallery();
  }
  function openDialog(dialog) { lastFocusedElement=document.activeElement; dialog.showModal(); dialog.scrollTop=0; }
  function closeDialog(dialog) { dialog.close(); lastFocusedElement?.focus({preventScroll:true}); }
  function syncDetailSave() {
    if (!selectedPalette) return;
    const saved=isSaved(selectedPalette.id); $('detail-save').innerHTML=icon('heart')+(saved?'已收藏':'收藏配色');
    $('detail-save').classList.toggle('saved',saved); $('detail-save').setAttribute('aria-pressed',saved);
  }
  function showDetail(palette,index=0) {
    selectedPalette=palette; $('detail-name').textContent=`配色 / ${String(index+1).padStart(2,'0')}`;
    $('detail-preview').innerHTML=previewHtml(palette,previewType(index),index);
    $('detail-colors').style.setProperty('--count',palette.colors.length);
    $('detail-colors').innerHTML=palette.colors.map(hex=>{
      const rgb=C.hexToRgb(hex), hsl=C.rgbToHsl(rgb).map(Math.round), cmyk=C.rgbToCmyk(rgb).map(Math.round);
      return `<div class="detail-color"><div class="color-sample" style="background:${hex};color:${C.textOn(hex)}"><button class="icon-button" data-copy="${hex}" aria-label="复制 ${hex}">${icon('copy')}</button></div><button class="color-code" data-copy="${hex}" title="复制色值">${hex}</button><p>RGB ${rgb.join(' ')}\nHSL ${hsl[0]} ${hsl[1]} ${hsl[2]}\nCMYK ${cmyk.join(' ')}</p><button class="base-this" data-base="${hex}" aria-label="将 ${hex} 设为基准色">设为基准色 ↗</button></div>`;
    }).join('');
    const options=palette.colors.map((hex,i)=>`<option value="${i}">${String(i+1).padStart(2,'0')} / ${hex}</option>`).join('');
    $('contrast-foreground').innerHTML=options; $('contrast-background').innerHTML=options;
    const pair=bestPair(palette.colors); $('contrast-foreground').value=pair[0]; $('contrast-background').value=pair[1];
    updateContrast(); syncDetailSave(); openDialog($('palette-dialog'));
  }
  function updateContrast() {
    if (!selectedPalette) return;
    const colors=selectedPalette.colors, fg=colors[+$('contrast-foreground').value], bg=colors[+$('contrast-background').value], ratio=C.contrast(fg,bg);
    $('contrast-example').style.color=fg; $('contrast-example').style.background=bg;
    $('contrast-ratio').textContent=`${ratio.toFixed(2)}:1`;
    $('contrast-badges').innerHTML=[['普通字 AA',4.5],['普通字 AAA',7],['大字 AA',3]].map(([label,min])=>`<span class="contrast-badge ${ratio>=min?'pass':'fail'}">${ratio>=min?'✓':'×'} ${label}</span>`).join('');
  }
  function svgExport(palettes) {
    const width=900,rowHeight=190,height=68+palettes.length*rowHeight+36;
    const rows=palettes.map((p,index)=>{
      const y=78+index*rowHeight,sw=(width-80)/p.colors.length;
      return `<g><text x="40" y="${y}" font-size="13" fill="#555">PALETTE / ${String(index+1).padStart(2,'0')}</text>${p.colors.map((hex,i)=>`<rect x="${40+i*sw}" y="${y+14}" width="${sw+.2}" height="110" fill="${hex}"/><text x="${40+i*sw+12}" y="${y+110}" font-family="monospace" font-size="12" fill="${C.textOn(hex)}">${hex}</text>`).join('')}</g>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#F7F7F5"/><g font-family="Segoe UI,Microsoft YaHei,sans-serif"><text x="40" y="35" font-size="18" font-weight="600" fill="#292B2C">chroma. / 色彩实验室</text>${rows}<text x="40" y="${height-22}" font-size="9" fill="#888">A LITTLE SCIENCE. A LOT OF FEELING.</text></g></svg>`;
  }
  function getExport(palettes,format) {
    if (format==='json') return {filename:'chroma-palettes.json',type:'application/json;charset=utf-8',text:JSON.stringify({app:'CHROMA 色彩实验室',version:2,colorSpace:'sRGB',palettes:palettes.map((p,i)=>({index:i+1,colors:p.colors,relationship:C.ruleLabels[p.rule]||'自由配色',effect:C.effectLabels[p.effect]||'自定义',base:p.base}))},null,2)};
    if (format==='svg') return {filename:'chroma-palettes.svg',type:'image/svg+xml;charset=utf-8',text:svgExport(palettes)};
    return {filename:'chroma-palettes.css',type:'text/css;charset=utf-8',text:':root {\n'+palettes.map((p,i)=>`  /* Palette ${String(i+1).padStart(2,'0')} */\n`+p.colors.map((hex,j)=>`  --palette-${i+1}-color-${j+1}: ${hex};`).join('\n')).join('\n\n')+'\n}\n'};
  }
  function renderExport() {
    exported=getExport(visiblePalettes(),exportFormat); $('export-preview').textContent=exported.text; $('export-file-label').textContent=exported.filename;
    $$('[data-format]').forEach(b=>{const active=b.dataset.format===exportFormat;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
  }
  function setTheme() {
    document.documentElement.dataset.theme=state.theme;
    $('theme-button').innerHTML=icon(state.theme==='light'?'moon':'sun');
    $('theme-button').setAttribute('aria-label',`切换为${state.theme==='light'?'暗':'亮'}色模式`);
  }

  // Events are delegated for regenerated card and swatch elements.
  document.addEventListener('click',event=>{
    const copyButton=event.target.closest('[data-copy]'); if (copyButton) { copy(copyButton.dataset.copy,`已复制 ${copyButton.dataset.copy}`); return; }
    const detail=event.target.closest('[data-detail]'); if (detail) { const palettes=visiblePalettes(),index=palettes.findIndex(p=>p.id===detail.dataset.detail); if(index>=0) showDetail(palettes[index],index); return; }
    const save=event.target.closest('[data-save]'); if (save) { const p=visiblePalettes().find(p=>p.id===save.dataset.save); if(p) toggleFavorite(p); return; }
    const related=event.target.closest('[data-related]'); if (related) {setBase(related.dataset.related);return;}
    const base=event.target.closest('[data-base]'); if(base) {setBase(base.dataset.base);closeDialog($('palette-dialog'));setPage('explore');toast('已设为基准色');}
  });
  $$('[data-picker]').forEach(button=>button.addEventListener('click',()=>{
    state.picker=button.dataset.picker;
    $$('[data-picker]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;});
    $('picker-panel').setAttribute('aria-labelledby',button.id);
    $('wheel-panel').hidden=state.picker!=='wheel';$('channel-panel').hidden=state.picker==='wheel';
    if(state.picker!=='wheel')renderChannelPanel();
  }));
  $$('[data-picker]').forEach((button,index)=>{
    button.tabIndex=index===0?0:-1;
    button.addEventListener('keydown',event=>{
      const tabs=$$('[data-picker]');
      const target=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
      if(target===null)return;
      event.preventDefault();tabs[target].click();tabs[target].focus();
    });
  });
  $$('[data-relation]').forEach(button=>button.addEventListener('click',()=>{
    state.relation=button.dataset.relation;$$('[data-relation]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});renderRelated();
  }));
  $$('[data-count]').forEach(button=>button.addEventListener('click',()=>{state.count=+button.dataset.count;syncControls();regenerate();}));
  $$('[data-effect]').forEach(button=>button.addEventListener('click',()=>{state.effect=button.dataset.effect;syncControls();regenerate();}));
  $$('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;syncControls();renderGallery();persist();}));
  $$('[data-page]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.page)));
  document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();setPage('explore');window.scrollTo({top:0,behavior:'smooth'});});
  $('back-explore').addEventListener('click',()=>setPage('explore'));
  $('harmony-select').addEventListener('change',()=>{state.rule=$('harmony-select').value;regenerate();});
  $('lock-base').addEventListener('change',()=>{state.lock=$('lock-base').checked;regenerate();});
  $('hex-input').addEventListener('change',()=>{
    const hex=C.normalizeHex($('hex-input').value.trim());
    if(!hex){$('hex-error').textContent='请输入 3 位或 6 位 HEX，例如 #75689B';$('hex-input').setAttribute('aria-invalid','true');return;}
    setBase(hex);
  });
  $('hex-input').addEventListener('keydown',event=>{if(event.key==='Enter')$('hex-input').blur();});
  $('native-color').addEventListener('input',()=>setBase($('native-color').value,null,true));
  $('native-color').addEventListener('change',()=>regenerate());
  $('copy-base').addEventListener('click',()=>copy(state.base,`已复制 ${state.base}`));
  $('random-color').addEventListener('click',()=>setBase(C.oklchToHex([.42+Math.random()*.35,.05+Math.random()*.15,Math.random()*360])));
  $('generate-button').addEventListener('click',()=>{
    const previous=state.palettes.slice(0,12);advanceSeed();regenerate({previous});
  });
  $('load-more').addEventListener('click',()=>{
    if(renderTimer)regenerate();
    const previous=state.palettes.slice(-12);advanceSeed();
    state.palettes=[...state.palettes,...C.generate({...state,offset:state.palettes.length,previous})];renderGallery();
  });
  $('theme-button').addEventListener('click',()=>{state.theme=state.theme==='light'?'dark':'light';setTheme();persist();});
  $('help-button').addEventListener('click',()=>openDialog($('help-dialog')));
  $$('dialog').forEach(dialog=>{
    dialog.querySelector('.close-dialog').addEventListener('click',()=>closeDialog(dialog));
    dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog(dialog);});
  });
  ['contrast-foreground','contrast-background'].forEach(id=>$(id).addEventListener('change',updateContrast));
  $('swap-contrast').addEventListener('click',()=>{const a=$('contrast-foreground').value;$('contrast-foreground').value=$('contrast-background').value;$('contrast-background').value=a;updateContrast();});
  $('detail-save').addEventListener('click',()=>{if(selectedPalette)toggleFavorite(selectedPalette);});
  $('detail-copy').addEventListener('click',()=>{if(selectedPalette)copy(selectedPalette.colors.join(', '),'已复制整组色值');});
  $('detail-svg').addEventListener('click',()=>{if(selectedPalette)download(svgExport([selectedPalette]),'chroma-palette.svg','image/svg+xml;charset=utf-8');});
  $('export-button').addEventListener('click',()=>{
    $('export-description').textContent=`导出${state.page==='favorites'?'收藏的':'当前展示的'} ${visiblePalettes().length} 组配色。色值采用 sRGB，SVG 可在设计软件中继续编辑。`;
    renderExport();openDialog($('export-dialog'));
  });
  $$('[data-format]').forEach(b=>b.addEventListener('click',()=>{exportFormat=b.dataset.format;renderExport();}));
  $('copy-export').addEventListener('click',()=>{if(exported)copy(exported.text);});
  $('download-export').addEventListener('click',()=>{if(exported)download(exported.text,exported.filename,exported.type);});
  document.addEventListener('keydown',event=>{
    const interactive=event.target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="slider"]');
    if(event.code==='Space'&&!event.repeat&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!interactive&&!$$('dialog[open]').length&&state.page==='explore'){
      event.preventDefault();$('generate-button').click();
    }
  });
  drawWheel();setTheme();syncControls();updatePicker();renderRelated();regenerate();
})();
