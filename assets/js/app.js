/* =========================
   Samples (original text)
   ========================= */
const SAMPLES = [
  {
    id:"sample1",
    title:"Tape, Formats, and Failure Modes in Early Computing",
    text:
`INTRODUCTION
In early data processing, storage was slow, fragile, and expensive. Engineers therefore treated formatting as a first-class design problem. When the physical medium is unreliable, the document structure matters: headings, paragraphs, and consistent punctuation can be the difference between recoverable data and nonsense.

METHOD
A typical workflow converted a printed report into machine-readable form. Operators typed the text, replaced unavailable punctuation with a substitute, and then ran programs that separated the text into words and sentences. After that, extremely common words were removed, because they carry little topical meaning. Next, related word forms were consolidated so that similar and similarity counted as one notion rather than two.

RESULTS
Two practical consequences followed. First, word frequency became a workable signal: writers repeat terms when they elaborate a central argument. Second, proximity mattered. If two important terms occur close together inside a sentence, the sentence is more likely to express a compact idea. As a result, a system can assign a numerical score to each sentence and extract the highest-scoring ones.

CONCLUSION
This approach is not perfect. However, it is remarkably transparent: you can see why a sentence was chosen, and you can tune the cutoff to produce a shorter or longer abstract. Even today, this clarity is valuable when you need controllable summaries rather than black-box generation.`
  },
  {
    id:"sample2",
    title:"Sea Breezes and Urban Heat: A Short Explainer",
    text:
`ABSTRACT
Cities often run warmer than nearby rural areas, a pattern widely known as the urban heat island. The effect is significant because it changes energy demand, health risk, and local wind patterns.

BACKGROUND
During the day, asphalt and concrete store heat efficiently. At night, those surfaces release heat slowly, so the air remains warmer. In contrast, vegetation cools the air through shade and evaporation. This difference can be especially important during heat waves.

KEY MECHANISM
A sea breeze forms when land warms faster than water. Warm air rises over land, and cooler air moves inland to replace it. If the city is much warmer than its surroundings, the pressure gradient can increase and the breeze can arrive earlier. However, tall buildings can also disrupt flow and create turbulence.

DISCUSSION
The greatest uncertainty is often the boundary layer: small changes in humidity, cloud cover, or regional wind can flip the outcome. Therefore, observational campaigns focus on vertical profiles and repeated measurements.

CONCLUSIONS
Urban design choices—trees, reflective roofs, and open corridors—can meaningfully reduce night-time heat. In conclusion, the most effective interventions are usually local, practical, and scalable.`
  },
  {
    id:"sample3",
    title:"DIY CPU Mods as a Social Technology",
    text:
`INTRODUCTION
Hardware mod scenes are not only technical. They also build status, trust, and a shared language. A successful mod becomes a story: who found the trick first, who proved stability, and who sold a working bundle.

WHAT CHANGED
As platforms matured, manufacturers locked down more of the stack. Microcode, signed firmware, and tighter power limits made some shortcuts impossible. Nevertheless, the community adapted: they documented pin mods, mapped out strap resistors, and tested borderline configurations.

WHY IT SPREAD
The appeal is obvious. A cheap part can sometimes perform like a more expensive one. That result feels glorious, even when the method is messy. In addition, public benchmarks act as a scoreboard, so one stable configuration can become famous overnight.

LIMITS
Not every hack is wise. Some practices are risky, and the least reliable parts create the most drama. People may exaggerate results, and failures are quietly deleted. Therefore, careful logging and repeatable tests are essential.

CONCLUSION
In the end, the scene is a mix of engineering and theater. It teaches practical constraints, and it also exposes the economics of scarcity. Most importantly, it shows how knowledge circulates when formal support is absent.`
  },
];

/* =========================
   Utilities: tokenization
   ========================= */
function normNewlines(s){ return (s||"").replace(/\r\n/g,"\n").replace(/\r/g,"\n"); }

function wordsOf(text){
  // returns lowercase word tokens (letters + optional apostrophe segment)
  const re = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  const out = [];
  const t = text || "";
  let m;
  while((m = re.exec(t)) !== null){
    out.push(m[0].toLowerCase());
  }
  return out;
}

function splitIntoSentences(text){
  // Heuristic sentence splitter (no external libs).
  // Respects common abbreviations and decimals reasonably well.
  const abbr = new Set([
    "mr","mrs","ms","dr","prof","sr","jr","st","vs","etc","e.g","i.e","fig","no","dept",
    "u.s","u.k","u.n","jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec"
  ]);

  const t = (text||"").replace(/\s+/g, (m)=> m.includes("\n") ? "\n" : " ");
  const sentences = [];
  let buf = "";

  function tailWordBeforePeriod(b){
    // last token possibly like "e.g." or "U.S."
    const tail = b.slice(Math.max(0, b.length-40)).trim();
    // acronym like U.S. or U.S.A.
    if (/(?:\b[A-Z]\.){2,}$/.test(tail)) return {type:"acronym"};
    const m = tail.match(/(\b[A-Za-z]+(?:\.[A-Za-z]+)*)\.$/);
    if(!m) return null;
    return {type:"word", w:m[1].toLowerCase()};
  }

  for(let i=0;i<t.length;i++){
    const ch = t[i];
    buf += ch;

    const isEndPunct = (ch==="." || ch==="!" || ch==="?");
    if(!isEndPunct) continue;

    // handle ellipsis
    if(ch==="." && t[i+1]==="." ){
      continue;
    }

    // check decimal number like 3.14
    const prev = t[i-1] || "";
    const next = t[i+1] || "";
    if(ch==="." && /\d/.test(prev) && /\d/.test(next)){
      continue;
    }

    if(ch==="." ){
      const info = tailWordBeforePeriod(buf);
      if(info && info.type==="acronym"){
        // could be sentence end, but keep conservative: don't split unless next is newline or end
        if(next === "\n" || next === "" ) {
          const s = buf.trim();
          if(s) sentences.push(s);
          buf = "";
        }
        continue;
      }
      if(info && info.type==="word"){
        const w = info.w;
        if(abbr.has(w)){
          continue;
        }
        // initial like "A."
        if(/^\b[a-z]\b$/.test(w)) continue;
      }
    }

    // boundary if next is whitespace/newline/end or quote then whitespace
    const look = t.slice(i+1, i+6);
    if(look === "") {
      const s = buf.trim();
      if(s) sentences.push(s);
      buf = "";
      continue;
    }

    const m = look.match(/^\s+|^[\n]/);
    const m2 = look.match(/^[)"'\]]\s/);

    if(m || m2 || next==="\n"){
      const s = buf.trim();
      if(s) sentences.push(s);
      buf = "";
    }
  }

  const rest = buf.trim();
  if(rest) sentences.push(rest);
  return sentences;
}

/* =========================
   Luhn 1958: word consolidation
   ========================= */
function commonPrefixLen(a,b){
  const n = Math.min(a.length,b.length);
  let i=0;
  while(i<n && a[i]===b[i]) i++;
  return i;
}

function luhnConsolidationMap(uniqueWordsSorted){
  // Paper procedure: compare pairs of succeeding words in alphabetized list;
  // from first mismatch, combined count of subsequent non-similar letters of both words.
  // if count <= 6, treat as same notion (merge).
  // We implement transitive closure via union-find.
  const n = uniqueWordsSorted.length;
  const parent = new Array(n);
  const rank = new Array(n).fill(0);
  for(let i=0;i<n;i++) parent[i]=i;

  function find(x){
    while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; }
    return x;
  }
  function union(a,b){
    let ra=find(a), rb=find(b);
    if(ra===rb) return;
    if(rank[ra]<rank[rb]) parent[ra]=rb;
    else if(rank[ra]>rank[rb]) parent[rb]=ra;
    else { parent[rb]=ra; rank[ra]++; }
  }

  for(let i=0;i<n-1;i++){
    const w1 = uniqueWordsSorted[i];
    const w2 = uniqueWordsSorted[i+1];
    const p = commonPrefixLen(w1,w2);
    const mismatch = (w1.length - p) + (w2.length - p);
    if(mismatch <= 6){
      union(i,i+1);
    }
  }

  // representative: smallest index word in the set (alphabetical earliest)
  const repIndex = new Map();
  for(let i=0;i<n;i++){
    const r = find(i);
    if(!repIndex.has(r) || i < repIndex.get(r)) repIndex.set(r,i);
  }

  const map = new Map();
  for(let i=0;i<n;i++){
    const r = find(i);
    const rep = uniqueWordsSorted[repIndex.get(r)];
    map.set(uniqueWordsSorted[i], rep);
  }
  return map;
}

/* =========================
   Parsing: headings + paragraphs
   ========================= */
function isHeadingLine(line){
  const s = line.trim();
  if(!s) return false;
  if(/^#{1,6}\s+/.test(s)) return true;
  if(/:\s*$/.test(s) && s.length <= 80) return true;
  // ALL CAPS-ish headings
  const letters = s.replace(/[^A-Za-z]/g,"");
  if(letters.length >= 3 && letters === letters.toUpperCase() && s.length <= 80) return true;
  return false;
}

function stripHeadingMarkup(line){
  let s = line.trim();
  s = s.replace(/^#{1,6}\s+/,"");
  s = s.replace(/:\s*$/,"");
  return s.trim();
}

function parseDocumentWithHeadings(bodyText){
  const text = normNewlines(bodyText||"");
  const lines = text.split("\n");

  let currentHeading = null;
  let paraLines = [];
  const paragraphs = [];
  const headingsInOrder = []; // for Title glossary

  function pushPara(){
    const joined = paraLines.join(" ").replace(/\s+/g," ").trim();
    if(joined){
      paragraphs.push({ heading: currentHeading, text: joined });
    }
    paraLines = [];
  }

  for(const rawLine of lines){
    const line = rawLine.replace(/\t/g," ").trimEnd();
    if(!line.trim()){
      pushPara();
      continue;
    }
    if(isHeadingLine(line)){
      pushPara();
      const h = stripHeadingMarkup(line);
      currentHeading = h || currentHeading;
      if(h) headingsInOrder.push(h);
      continue;
    }
    paraLines.push(line.trim());
  }
  pushPara();

  // Sentence segmentation per paragraph
  let allSentences = [];
  paragraphs.forEach((p, pi)=>{
    const sents = splitIntoSentences(p.text);
    const sentObjs = sents.map((s, si)=>({
      text:s,
      heading:p.heading,
      paragraphIndex:pi,
      sentenceIndexInParagraph:si,
      paragraphSentenceCount:sents.length
    }));
    allSentences = allSentences.concat(sentObjs);
  });

  return { paragraphs, headingsInOrder, sentences: allSentences };
}

/* =========================
   Edmundson dictionaries parsing
   ========================= */
function parseWeightedWordList(text, defaultWeight){
  // Each non-empty line: "word", "word weight", "word=weight"
  // # starts comment
  const map = new Map();
  const lines = normNewlines(text||"").split("\n");
  for(let line of lines){
    line = line.trim();
    if(!line) continue;
    if(line.startsWith("#")) continue;
    const eq = line.split("=");
    if(eq.length === 2){
      const w = eq[0].trim().toLowerCase();
      const val = Number(eq[1].trim());
      if(w) map.set(w, Number.isFinite(val) ? val : defaultWeight);
      continue;
    }
    const parts = line.split(/\s+/);
    const w = (parts[0]||"").toLowerCase();
    if(!w) continue;
    if(parts.length >= 2){
      const val = Number(parts[1]);
      map.set(w, Number.isFinite(val) ? val : defaultWeight);
    } else {
      map.set(w, defaultWeight);
    }
  }
  return map;
}

function parseNullList(text){
  const set = new Set();
  const lines = normNewlines(text||"").split("\n");
  for(let line of lines){
    line = line.trim();
    if(!line) continue;
    if(line.startsWith("#")) continue;
    set.add(line.toLowerCase());
  }
  return set;
}

/* =========================
   Luhn summarizer
   ========================= */
function luhnSummarize(rawText, opts){
  const stopSet = new Set(opts.stopwords.map(w=>w.toLowerCase()));
  const gap = Math.max(0, opts.gap|0);
  const lowFreq = Math.max(0, opts.lowFreq|0);
  const highFreq = Math.max(1, opts.highFreq|0);

  // parse sentences (ignoring headings: treat everything as text for Luhn)
  const text = normNewlines(rawText||"").replace(/\n+/g,"\n");
  const sentences = splitIntoSentences(text.replace(/\n/g," "));
  const sentenceObjs = sentences.map((s, idx)=>({ id: idx, text: s }));

  // tokenize all words, remove stopwords for frequency list (as in paper)
  let allWords = wordsOf(text);
  allWords = allWords.filter(w => !stopSet.has(w));

  // unique + sort
  const uniq = Array.from(new Set(allWords)).sort();

  // optional consolidation (paper-accurate)
  let consolidation = null;
  if(opts.consolidate){
    consolidation = luhnConsolidationMap(uniq);
  }

  // frequency counts (after consolidation if enabled)
  const freq = new Map();
  for(const w0 of allWords){
    const w = consolidation ? (consolidation.get(w0) || w0) : w0;
    freq.set(w, (freq.get(w)||0)+1);
  }

  // significant words:
  // - delete low frequency words (<= lowFreq)
  // - delete very frequent words (>= highFreq) (line C concept)
  const significant = new Set();
  for(const [w, c] of freq.entries()){
    if(c <= lowFreq) continue;
    if(c >= highFreq) continue;
    significant.add(w);
  }

  // sentence scoring with clusters
  function scoreSentence(sentenceText){
    const toks0 = wordsOf(sentenceText);
    const toks = toks0.map(w=> consolidation ? (consolidation.get(w)||w) : w);
    const sigFlags = toks.map(w => significant.has(w));
    let best = 0;

    let clusterStart = -1;
    let lastSig = -1;
    let sigCount = 0;

    for(let i=0;i<toks.length;i++){
      if(!sigFlags[i]) continue;
      if(clusterStart === -1){
        clusterStart = i;
        lastSig = i;
        sigCount = 1;
      } else {
        const nonsigBetween = i - lastSig - 1;
        if(nonsigBetween <= gap){
          lastSig = i;
          sigCount++;
        } else {
          const totalWords = (lastSig - clusterStart + 1);
          const score = (sigCount*sigCount) / totalWords;
          if(score > best) best = score;

          clusterStart = i;
          lastSig = i;
          sigCount = 1;
        }
      }
    }
    if(clusterStart !== -1){
      const totalWords = (lastSig - clusterStart + 1);
      const score = (sigCount*sigCount) / totalWords;
      if(score > best) best = score;
    }
    return best;
  }

  const scored = sentenceObjs.map(s => ({...s, score: scoreSentence(s.text)}));
  const ranked = [...scored].sort((a,b)=> b.score - a.score || a.id - b.id);

  // selection
  let picked = new Set();
  if(opts.mode === "cutoff"){
    const cutoff = Number(opts.target);
    for(const s of ranked){
      if(s.score >= cutoff) picked.add(s.id);
    }
  } else if(opts.mode === "count"){
    const n = Math.max(1, Math.floor(Number(opts.target)));
    ranked.slice(0,n).forEach(s => picked.add(s.id));
  } else { // ratio
    const r = Number(opts.target);
    const n = Math.max(1, Math.ceil(r * ranked.length));
    ranked.slice(0,n).forEach(s => picked.add(s.id));
  }

  const pickedInOrder = scored.filter(s => picked.has(s.id));

  // diagnostics: top significant words
  const sigList = Array.from(significant).map(w=>({w, c: freq.get(w)||0}))
    .sort((a,b)=> b.c - a.c || a.w.localeCompare(b.w))
    .slice(0, 60);

  return {
    algo:"luhn",
    sentences: scored,
    ranked,
    picked,
    pickedInOrder,
    significantWords: sigList,
    meta: {
      totalSentences: scored.length,
      pickedSentences: pickedInOrder.length,
      gap,
      lowFreq,
      highFreq,
      consolidate: !!opts.consolidate
    }
  };
}

/* =========================
   Edmundson summarizer
   ========================= */
function edmundsonSummarize(title, body, opts){
  const doc = parseDocumentWithHeadings(body);
  const sentences = doc.sentences;

  const bonus = parseWeightedWordList(opts.bonusText, +1);
  const stigma = parseWeightedWordList(opts.stigmaText, -1);
  const nullSet = parseNullList(opts.nullText);
  const headDict = parseWeightedWordList(opts.headingDictText, +1);

  // cue dictionary: bonus+stigma+null (null has 0)
  const cue = new Map();
  for(const [w,val] of bonus.entries()) cue.set(w,val);
  for(const [w,val] of stigma.entries()) cue.set(w,val);
  for(const w of nullSet) cue.set(w, 0);

  // Title glossary: non-null words from title + headings
  const titleW = Math.max(0, opts.titleW|0);
  const headingW = Math.max(0, opts.headingW|0);
  const titleGloss = new Map();
  for(const w of wordsOf(title||"")){
    if(nullSet.has(w)) continue;
    titleGloss.set(w, Math.max(titleGloss.get(w)||0, titleW));
  }
  for(const h of doc.headingsInOrder){
    for(const w of wordsOf(h)){
      if(nullSet.has(w)) continue;
      titleGloss.set(w, Math.max(titleGloss.get(w)||0, headingW));
    }
  }

  // Heading weights per heading text
  const headingWeightCache = new Map();
  function headingWeight(headingText){
    const key = headingText || "";
    if(headingWeightCache.has(key)) return headingWeightCache.get(key);
    let sum = 0;
    for(const w of wordsOf(headingText||"")){
      if(headDict.has(w)) sum += headDict.get(w);
    }
    headingWeightCache.set(key, sum);
    return sum;
  }

  // Ordinal weights
  const O1 = opts.O1|0, O2 = opts.O2|0, O3 = opts.O3|0, O4 = opts.O4|0;
  const lastParaIndex = doc.paragraphs.length ? (doc.paragraphs.length - 1) : 0;

  // Key glossary creation
  const allBodyWords = wordsOf(body);
  const totalOccurrences = allBodyWords.length;

  // frequency of non-cue words
  const nonCueFreq = new Map();
  for(const w of allBodyWords){
    if(cue.has(w)) continue;
    nonCueFreq.set(w, (nonCueFreq.get(w)||0)+1);
  }

  // sort non-cue words by frequency desc
  const nonCueSorted = Array.from(nonCueFreq.entries())
    .map(([w,c])=>({w,c}))
    .sort((a,b)=> b.c - a.c || a.w.localeCompare(b.w));

  const keyPct = Math.max(0, Math.min(100, Number(opts.keyPct)));
  const targetCount = (keyPct/100) * totalOccurrences;

  let cum = 0;
  let freqThreshold = Infinity;
  for(const item of nonCueSorted){
    cum += item.c;
    freqThreshold = item.c;
    if(cum >= targetCount) break;
  }
  if(!Number.isFinite(freqThreshold)) freqThreshold = Infinity;
  const keyGloss = new Map();
  for(const item of nonCueSorted){
    if(item.c >= freqThreshold){
      keyGloss.set(item.w, item.c);
    } else {
      break;
    }
  }

  // sentence-level scoring
  const aC = opts.aC|0, aK = opts.aK|0, aT = opts.aT|0, aL = opts.aL|0;

  function cueScore(sent){
    let s = 0;
    for(const w of wordsOf(sent)){
      if(cue.has(w)) s += cue.get(w);
    }
    return s;
  }
  function keyScore(sent){
    let s = 0;
    for(const w of wordsOf(sent)){
      if(keyGloss.has(w)) s += keyGloss.get(w);
    }
    return s;
  }
  function titleScore(sent){
    let s = 0;
    for(const w of wordsOf(sent)){
      if(titleGloss.has(w)) s += titleGloss.get(w);
    }
    return s;
  }
  function locationScore(sentObj){
    const hw = headingWeight(sentObj.heading);
    let ow = 0;
    if(sentObj.paragraphIndex === 0) ow += O1;
    if(sentObj.paragraphIndex === lastParaIndex) ow += O2;
    if(sentObj.sentenceIndexInParagraph === 0) ow += O3;
    if(sentObj.sentenceIndexInParagraph === (sentObj.paragraphSentenceCount - 1)) ow += O4;
    return hw + ow;
  }

  const scored = sentences.map((s, idx)=>{
    const C = cueScore(s.text);
    const K = keyScore(s.text);
    const T = titleScore(s.text);
    const L = locationScore(s);
    const score = aC*C + aK*K + aT*T + aL*L;
    return {
      id: idx,
      text: s.text,
      heading: s.heading,
      paragraphIndex: s.paragraphIndex,
      sentenceIndexInParagraph: s.sentenceIndexInParagraph,
      paragraphSentenceCount: s.paragraphSentenceCount,
      parts: {C,K,T,L},
      score
    };
  });

  const ranked = [...scored].sort((a,b)=> b.score - a.score || a.id - b.id);

  let nPick = 1;
  if(opts.mode === "count"){
    nPick = Math.max(1, Math.floor(Number(opts.target)));
  } else {
    const r = Number(opts.target);
    nPick = Math.max(1, Math.ceil(r * ranked.length));
  }

  const picked = new Set(ranked.slice(0,nPick).map(x=>x.id));
  const pickedInOrder = scored.filter(s => picked.has(s.id));

  // diagnostics: show top key words
  const keyTop = Array.from(keyGloss.entries())
    .map(([w,c])=>({w,c}))
    .sort((a,b)=> b.c - a.c || a.w.localeCompare(b.w))
    .slice(0, 60);

  return {
    algo:"edmundson",
    title: title || "",
    doc,
    sentences: scored,
    ranked,
    picked,
    pickedInOrder,
    keyGlossTop: keyTop,
    meta:{
      totalSentences: scored.length,
      pickedSentences: pickedInOrder.length,
      keyPct,
      keyFreqThreshold: freqThreshold,
      coeffs:{aC,aK,aT,aL},
      ordinal:{O1,O2,O3,O4},
      titleWeights:{titleW, headingW}
    }
  };
}

/* =========================
   Rendering
   ========================= */
function esc(s){
  return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function renderSummary(result){
  const el = document.getElementById("summary");
  const meta = document.getElementById("summaryMeta");
  const stats = document.getElementById("statsPill");

  meta.textContent = t("summary.meta", {picked: result.meta.pickedSentences, total: result.meta.totalSentences});
  stats.textContent = statusText(result.algo);

  if(result.algo === "luhn"){
    let html = `<h3>${esc(t("summary.luhnTitle"))}</h3>`;
    for(const s of result.pickedInOrder){
      html += `<p class="sent"><span class="score">(${s.score.toFixed(2)})</span> ${esc(s.text)}</p>`;
    }
    el.innerHTML = html || `<div class='small'>${esc(t("summary.noneSelected"))}</div>`;
  } else {
    let html = `<h3>${esc(t("summary.title"))}</h3><div class="sent">${esc(result.title || t("summary.noTitle"))}</div>`;
    let currentHeading = null;
    for(const s of result.pickedInOrder){
      if(s.heading && s.heading !== currentHeading){
        currentHeading = s.heading;
        html += `<div class="heading">${esc(currentHeading)}</div>`;
      } else if(!s.heading && currentHeading !== null){
        currentHeading = null;
        html += `<div class="heading">${esc(t("summary.noHeading"))}</div>`;
      }
      const {C,K,T,L} = s.parts;
      html += `<p class="sent"><span class="score">(${s.score})</span> <span class="small">C=${C}, K=${K}, T=${T}, L=${L}</span><br/>${esc(s.text)}</p>`;
    }
    el.innerHTML = html || `<div class='small'>${esc(t("summary.noneSelected"))}</div>`;
  }
}

function renderSentenceTable(result){
  const tbody = document.querySelector("#sentTable tbody");
  tbody.innerHTML = "";
  const rows = result.ranked.map((s, rankIdx)=>{
    const picked = result.picked.has(s.id);
    const score = (result.algo==="luhn") ? s.score.toFixed(2) : String(s.score);
    const sent = s.text || "";
    return `
      <tr>
        <td class="mono">${rankIdx+1}</td>
        <td class="score">${esc(score)}</td>
        <td class="mono">${picked ? "✓" : ""}</td>
        <td>${esc(sent)}</td>
      </tr>`;
  }).join("");
  tbody.innerHTML = rows;
}

function renderDiagnostics(result){
  const diag = document.getElementById("diag");
  const ttl = document.getElementById("rightDiagTitle");
  const meta = document.getElementById("rightDiagMeta");

  if(result.algo === "luhn"){
    ttl.textContent = t("diag.sigTitle");
    meta.textContent = `gap=${result.meta.gap}, low≤${result.meta.lowFreq}, high≥${result.meta.highFreq}, consolidate=${result.meta.consolidate}`;
    const items = result.significantWords.map(x=>
      `<tr><td class="mono">${esc(x.w)}</td><td class="mono">${x.c}</td></tr>`
    ).join("");
    diag.innerHTML = `
      <div class="small">${esc(t("diag.sigIntro"))}</div>
      <table>
        <thead><tr><th>${esc(t("diag.word"))}</th><th>${esc(t("diag.freq"))}</th></tr></thead>
        <tbody>${items || ""}</tbody>
      </table>
    `;
  } else {
    ttl.textContent = t("diag.keyTitle");
    meta.textContent = `keyPct=${result.meta.keyPct}% (threshold freq ≥ ${result.meta.keyFreqThreshold})`;
    const items = result.keyGlossTop.map(x=>
      `<tr><td class="mono">${esc(x.w)}</td><td class="mono">${x.c}</td></tr>`
    ).join("");
    diag.innerHTML = `
      <div class="small">
        ${esc(t("diag.keyIntro"))}
      </div>
      <table>
        <thead><tr><th>${esc(t("diag.word"))}</th><th>${esc(t("diag.weight"))}</th></tr></thead>
        <tbody>${items || ""}</tbody>
      </table>
      <div class="hint">
        ${esc(t("diag.coeffs", {aC: result.meta.coeffs.aC, aK: result.meta.coeffs.aK, aT: result.meta.coeffs.aT, aL: result.meta.coeffs.aL}))}
      </div>
    `;
  }
}

function renderHighlightedOriginal(rawText, pickedSentencesInOrder){
  // Highlight by replacing exact sentence occurrences (best-effort, first match only)
  let text = normNewlines(rawText||"");
  // Keep headings and original newlines.
  for(const s of pickedSentencesInOrder){
    const needle = s.text;
    const idx = text.indexOf(needle);
    if(idx >= 0){
      const before = text.slice(0, idx);
      const mid = text.slice(idx, idx + needle.length);
      const after = text.slice(idx + needle.length);
      text = before + "««HIGHLIGHT_START»»" + mid + "««HIGHLIGHT_END»»" + after;
    }
  }
  const html = esc(text)
    .replace(/««HIGHLIGHT_START»»/g, "<mark>")
    .replace(/««HIGHLIGHT_END»»/g, "</mark>");
  document.getElementById("highlighted").innerHTML = html;
}

/* =========================
   Defaults
   ========================= */
const DEFAULT_STOPWORDS = `
a
about
above
after
again
against
all
am
an
and
any
are
as
at
be
because
been
before
being
below
between
both
but
by
can
could
did
do
does
doing
down
during
each
few
for
from
further
had
has
have
having
he
her
here
hers
herself
him
himself
his
how
i
if
in
into
is
it
its
itself
just
me
more
most
my
myself
no
nor
not
now
of
off
on
once
only
or
other
our
ours
ourselves
out
over
own
same
she
should
so
some
such
than
that
the
their
theirs
them
themselves
then
there
these
they
this
those
through
to
too
under
until
up
very
was
we
were
what
when
where
which
while
who
whom
why
with
would
you
your
yours
yourself
yourselves
`.trim();

const DEFAULT_BONUS = `
significant 2
important 2
most 1
greatest 2
meaningful 2
therefore 1
thus 1
hence 1
in conclusion 0
conclusion 1
result 1
results 1
shows 1
demonstrates 1
clearly 1
remarkably 1
notably 1
especially 1
essential 1
`.trim();

const DEFAULT_STIGMA = `
hardly -2
impossible -2
maybe -1
perhaps -1
uncertain -1
least -1
minor -1
insignificant -2
unlikely -1
`.trim();

const DEFAULT_NULL = `
the
a
an
and
or
but
to
of
in
on
for
with
as
at
by
from
is
are
was
were
be
been
being
this
that
these
those
it
its
they
their
them
we
our
you
your
i
me
my
not
no
nor
very
also
however
there
here
`.trim();

const DEFAULT_HEADING_DICT = `
abstract 4
introduction 4
background 3
purpose 4
method 3
methods 3
results 4
discussion 3
conclusion 5
conclusions 5
summary 4
key 2
mechanism 2
limits 2
what 1
changed 1
why 1
`.trim();

/* =========================
   UI Wiring
   ========================= */
const $ = (id)=>document.getElementById(id);

/* =========================
   i18n
   ========================= */
const I18N = {
  en: {
    "lang.label": "Language",
    "lang.en": "English",
    "lang.zh": "中文",
    "header.title": "NLP Task Museum — Extractive Summarization <span class=\"pill\">Luhn 1958</span> <span class=\"pill\">Edmundson 1969</span>",
    "header.sub": "Offline, vanilla JS. Implements Luhn’s word-consolidation + significance-factor clustering, and Edmundson’s Cue/Key/Title/Location linear weighting. Use the sample articles or paste your own English text.",

    "left.controls": "Controls",
    "left.controlsTag": "input + parameters",
    "left.algorithm": "Algorithm",
    "algo.luhn": "Luhn (1958) — Significant-word clustering",
    "algo.edmundson": "Edmundson (1969) — Cue/Key/Title/Location",
    "left.sample": "Load a sample article",
    "sample.1": "Sample 1 — “Tape, Formats, and Failure Modes” (with headings)",
    "sample.2": "Sample 2 — “Sea Breezes and Urban Heat” (with headings)",
    "sample.3": "Sample 3 — “DIY CPU Mods as a Social Technology” (with headings)",
    "left.title": "Title (used by Edmundson Title method)",
    "left.titlePlaceholder": "Optional, but recommended for Edmundson Title method",
    "left.text": "Text (English only)",

    "luhn.params": "Luhn 1958 parameters",
    "luhn.mode": "Sentence selection mode",
    "luhn.mode.ratio": "Top by ratio",
    "luhn.mode.count": "Top N sentences",
    "luhn.mode.cutoff": "Score ≥ cutoff",
    "luhn.target": "Ratio / N / Cutoff",
    "luhn.gap": "Max non-significant gap (default 4)",
    "luhn.low": "Low-frequency deletion (≤ D)",
    "luhn.high": "Upper-frequency cutoff (≥ C)",
    "luhn.consolidateLabel": "Use Luhn 1958 “letter-by-letter” word consolidation (mismatch letters ≤ 6)",
    "luhn.consolidate.on": "On (paper-accurate)",
    "luhn.consolidate.off": "Off",
    "luhn.stopLabel": "Common-word deletion list (editable)",
    "luhn.stopSummary": "Show / edit common words (stop list)",
    "luhn.stopHint": "Used for Luhn’s “common words such as pronouns, prepositions, and articles” deletion stage.",
    "luhn.notes": "Notes: “Upper-frequency cutoff” removes overly frequent words (paper’s “line C” idea). “Low-frequency deletion” matches “words of a stipulated low frequency were deleted” in the procedure.",

    "edm.params": "Edmundson 1969 parameters",
    "edm.mode": "Summary length mode",
    "edm.mode.ratio": "Ratio of sentences (paper uses 25%)",
    "edm.mode.count": "Top N sentences",
    "edm.target": "Ratio / N",
    "edm.preset": "Preset weights",
    "edm.preset.all": "Use all methods (C + K + T + L)",
    "edm.preset.ctl": "Paper-favored variant (C + T + L, omit Key)",
    "edm.preset.cueOnly": "Cue only",
    "edm.preset.locusOnly": "Location only",
    "edm.keyPct": "Key glossary coverage (% of total word occurrences)",
    "edm.coeffs": "Linear combination coefficients: Score = aC·C + aK·K + aT·T + aL·L",
    "edm.titleHeading": "Title vs heading weights (coprime recommended)",
    "edm.ordinal": "Ordinal weights (Location method): O1=first paragraph, O2=last paragraph, O3=first sentence of paragraph, O4=last sentence of paragraph",
    "edm.headingDetect": "Headings are detected from lines that look like headings (ALL CAPS, Markdown “##”, or ending with “:”).",
    "edm.dicts": "Edmundson dictionaries (Cue + Heading)",
    "edm.bonusLabel": "Bonus words (each line: <span class=\"mono\">word</span> or <span class=\"mono\">word weight</span>)",
    "edm.bonusHint": "If no weight is provided, defaults to +1.",
    "edm.stigmaLabel": "Stigma words (each line: <span class=\"mono\">word</span> or <span class=\"mono\">word weight</span>)",
    "edm.stigmaHint": "If no weight is provided, defaults to −1.",
    "edm.null": "Null words (ignored; each line: word). These also act like stop-words for Title glossary.",
    "edm.headingDict": "Heading dictionary (Location method; each line: <span class=\"mono\">word weight</span>)",

    "btn.run": "Run summarizer",
    "btn.copy": "Copy summary",
    "btn.reset": "Reset to defaults",
    "left.tips": "Tips: try <span class=\"kbd\">Edmundson → preset “C+T+L”</span> and compare with <span class=\"kbd\">all methods</span>. For Luhn, adjust <span class=\"kbd\">gap</span> (4/5) and the <span class=\"kbd\">cutoff</span>.",

    "right.output": "Output",
    "right.outputTag": "summary + diagnostics",
    "right.summary": "Summary",
    "right.tableTitle": "Sentence scores",
    "right.tableMeta": "sorted by score",
    "table.rank": "#",
    "table.score": "Score",
    "table.picked": "Picked",
    "table.sentence": "Sentence",
    "right.original": "Original text (selected sentences highlighted)",
    "right.originalMeta": "Heading lines kept as-is",

    "status.ready": "ready",
    "status.luhn": "luhn",
    "status.edmundson": "edmundson",
    "status.running": "running…",
    "status.emptyText": "empty text",
    "status.done": "done",
    "status.copied": "copied",
    "status.copyFailed": "copy failed",

    "summary.meta": "{picked}/{total} sentences selected",
    "summary.generatedAt": "generated at {time}",
    "summary.noneSelected": "No sentences selected.",
    "summary.luhnTitle": "Selected sentences (Luhn 1958)",
    "summary.title": "Title",
    "summary.noTitle": "(no title)",
    "summary.noHeading": "(no heading)",

    "diag.sigTitle": "Diagnostics — significant words",
    "diag.keyTitle": "Diagnostics — key glossary",
    "diag.sigIntro": "Top significant words (after deletions).",
    "diag.keyIntro": "Key glossary words (non-cue) with weights = frequency, selected by cumulative coverage rule.",
    "diag.word": "Word",
    "diag.freq": "Freq",
    "diag.weight": "Weight",
    "diag.coeffs": "Coefficients: aC={aC}, aK={aK}, aT={aT}, aL={aL}."
  },
  "zh-CN": {
    "lang.label": "语言",
    "lang.en": "English",
    "lang.zh": "中文",
    "header.title": "NLP 任务博物馆 — 抽取式摘要 <span class=\"pill\">Luhn 1958</span> <span class=\"pill\">Edmundson 1969</span>",
    "header.sub": "离线、纯原生 JS。实现 Luhn 的词形合并 + 显著词聚类评分，以及 Edmundson 的线性加权（Cue/Key/Title/Location）。可加载示例文章或粘贴你自己的英文文本。",

    "left.controls": "控制",
    "left.controlsTag": "输入与参数",
    "left.algorithm": "算法",
    "algo.luhn": "Luhn（1958）— 显著词聚类",
    "algo.edmundson": "Edmundson（1969）— Cue/Key/Title/Location",
    "left.sample": "加载示例文章",
    "sample.1": "示例 1 — “Tape, Formats, and Failure Modes”（含标题行）",
    "sample.2": "示例 2 — “Sea Breezes and Urban Heat”（含标题行）",
    "sample.3": "示例 3 — “DIY CPU Mods as a Social Technology”（含标题行）",
    "left.title": "标题（Edmundson 的 Title 方法会用到）",
    "left.titlePlaceholder": "可选；但使用 Edmundson 时建议填写",
    "left.text": "正文（目前仅建议英文）",

    "luhn.params": "Luhn 1958 参数",
    "luhn.mode": "选句模式",
    "luhn.mode.ratio": "按比例取前 N%",
    "luhn.mode.count": "取前 N 句",
    "luhn.mode.cutoff": "分数 ≥ 阈值",
    "luhn.target": "比例 / N / 阈值",
    "luhn.gap": "最大非显著词间隔（默认 4）",
    "luhn.low": "低频删除（≤ D）",
    "luhn.high": "高频截断（≥ C）",
    "luhn.consolidateLabel": "启用 Luhn 1958 的“逐字母”词形合并（不匹配字母 ≤ 6）",
    "luhn.consolidate.on": "开（更贴近论文）",
    "luhn.consolidate.off": "关",
    "luhn.stopLabel": "常见词删除表（可编辑）",
    "luhn.stopSummary": "展开 / 编辑常见词（停用词表）",
    "luhn.stopHint": "用于 Luhn 的“诸如代词、介词、冠词等常见词”删除阶段。",
    "luhn.notes": "注：高频截断会移除过于高频的词（对应论文的“line C”思路）；低频删除对应“删除低频词”的步骤。",

    "edm.params": "Edmundson 1969 参数",
    "edm.mode": "摘要长度模式",
    "edm.mode.ratio": "按句子比例（论文默认 25%）",
    "edm.mode.count": "取前 N 句",
    "edm.target": "比例 / N",
    "edm.preset": "预设权重",
    "edm.preset.all": "使用全部方法（C + K + T + L）",
    "edm.preset.ctl": "论文偏好变体（C + T + L，省略 Key）",
    "edm.preset.cueOnly": "仅 Cue",
    "edm.preset.locusOnly": "仅 Location",
    "edm.keyPct": "Key 词表覆盖率（占总词出现次数百分比）",
    "edm.coeffs": "线性组合系数：Score = aC·C + aK·K + aT·T + aL·L",
    "edm.titleHeading": "标题 vs 标题行权重（建议互素）",
    "edm.ordinal": "序数权重（Location 方法）：O1=首段，O2=末段，O3=段首句，O4=段末句",
    "edm.headingDetect": "标题行从“看起来像标题”的行检测（全大写、Markdown“##”、或以“:”结尾）。",
    "edm.dicts": "Edmundson 词典（Cue + Heading）",
    "edm.bonusLabel": "加分词（每行：<span class=\"mono\">word</span> 或 <span class=\"mono\">word weight</span>）",
    "edm.bonusHint": "未写权重时默认 +1。",
    "edm.stigmaLabel": "扣分词（每行：<span class=\"mono\">word</span> 或 <span class=\"mono\">word weight</span>）",
    "edm.stigmaHint": "未写权重时默认 −1。",
    "edm.null": "空词（忽略；每行一个词）。这些也会作为 Title 词表的停用词。",
    "edm.headingDict": "标题词典（Location 方法；每行：<span class=\"mono\">word weight</span>）",

    "btn.run": "运行摘要器",
    "btn.copy": "复制摘要",
    "btn.reset": "恢复默认",
    "left.tips": "提示：试试 <span class=\"kbd\">Edmundson → 预设 “C+T+L”</span> 并与 <span class=\"kbd\">all methods</span> 对比。Luhn 可调 <span class=\"kbd\">gap</span>（4/5）和 <span class=\"kbd\">cutoff</span>。",

    "right.output": "输出",
    "right.outputTag": "摘要与诊断",
    "right.summary": "摘要",
    "right.tableTitle": "句子得分",
    "right.tableMeta": "按分数排序",
    "table.rank": "序号",
    "table.score": "得分",
    "table.picked": "选中",
    "table.sentence": "句子",
    "right.original": "原文（高亮选中的句子）",
    "right.originalMeta": "标题行保持原样",

    "status.ready": "就绪",
    "status.luhn": "Luhn",
    "status.edmundson": "Edmundson",
    "status.running": "运行中…",
    "status.emptyText": "请先输入正文",
    "status.done": "完成",
    "status.copied": "已复制",
    "status.copyFailed": "复制失败",

    "summary.meta": "已选 {picked}/{total} 句",
    "summary.generatedAt": "生成时间 {time}",
    "summary.noneSelected": "未选中任何句子。",
    "summary.luhnTitle": "选中句子（Luhn 1958）",
    "summary.title": "标题",
    "summary.noTitle": "（无标题）",
    "summary.noHeading": "（无标题行）",

    "diag.sigTitle": "诊断 — 显著词",
    "diag.keyTitle": "诊断 — Key 词表",
    "diag.sigIntro": "显著词 Top 列表（已执行删除/截断后）。",
    "diag.keyIntro": "Key 词表（非 Cue）及其权重（= 频次），按累计覆盖率规则选择。",
    "diag.word": "词",
    "diag.freq": "频次",
    "diag.weight": "权重",
    "diag.coeffs": "系数：aC={aC}，aK={aK}，aT={aT}，aL={aL}。"
  }
};

let currentLang = "en";
let lastResult = null;
let lastGeneratedAt = null;
let lastStatusKey = "ready";

function getInitialLang(){
  const saved = localStorage.getItem("lang");
  if(saved && I18N[saved]) return saved;
  const nav = (navigator.language || "").toLowerCase();
  if(nav.startsWith("zh")) return "zh-CN";
  return "en";
}

function tmpl(str, vars){
  return String(str).replace(/\{(\w+)\}/g, (_, k)=> (k in vars ? String(vars[k]) : `{${k}}`));
}

function t(key, vars = {}){
  const table = I18N[currentLang] || I18N.en;
  const raw = (key in table) ? table[key] : (I18N.en[key] ?? key);
  return tmpl(raw, vars);
}

function applyI18n(){
  document.documentElement.lang = (currentLang === "zh-CN") ? "zh-CN" : "en";

  for(const el of document.querySelectorAll("[data-i18n]")){
    const key = el.getAttribute("data-i18n");
    if(!key) continue;
    el.textContent = t(key);
  }
  for(const el of document.querySelectorAll("[data-i18n-html]")){
    const key = el.getAttribute("data-i18n-html");
    if(!key) continue;
    el.innerHTML = t(key);
  }
  for(const el of document.querySelectorAll("[data-i18n-placeholder]")){
    const key = el.getAttribute("data-i18n-placeholder");
    if(!key) continue;
    el.setAttribute("placeholder", t(key));
  }

  if(document.getElementById("statusPill")){
    setStatus(lastStatusKey);
  }
  updateMeta();

  if(lastResult){
    renderSummary(lastResult);
    renderSentenceTable(lastResult);
    renderDiagnostics(lastResult);
  }
}

function setLang(lang){
  currentLang = I18N[lang] ? lang : "en";
  localStorage.setItem("lang", currentLang);
  applyI18n();
}

function statusText(key){
  const table = I18N[currentLang] || I18N.en;
  const k = `status.${key}`;
  return (k in table) ? table[k] : (I18N.en[k] ?? key);
}

function setStatus(key){
  lastStatusKey = key;
  $("statusPill").textContent = statusText(key);
}

function updateMeta(){
  if(!lastResult) return;
  const meta = document.getElementById("summaryMeta");
  if(!meta) return;
  const {pickedSentences, totalSentences} = lastResult.meta;
  const base = t("summary.meta", {picked: pickedSentences, total: totalSentences});
  if(lastGeneratedAt){
    const time = lastGeneratedAt.toLocaleTimeString(currentLang === "zh-CN" ? "zh-CN" : "en");
    meta.textContent = `${base} · ${t("summary.generatedAt", {time})}`;
  } else {
    meta.textContent = base;
  }
}

function loadSample(id){
  const s = SAMPLES.find(x=>x.id===id) || SAMPLES[0];
  $("title").value = s.title;
  $("text").value = s.text;
}

function resetDefaults(){
  $("stopwords").value = DEFAULT_STOPWORDS;
  $("bonus").value = DEFAULT_BONUS;
  $("stigma").value = DEFAULT_STIGMA;
  $("nullw").value = DEFAULT_NULL;
  $("headdict").value = DEFAULT_HEADING_DICT;

  $("algo").value = "luhn";
  $("sample").value = "sample1";
  loadSample("sample1");

  $("luhnMode").value = "ratio";
  $("luhnTarget").value = "0.25";
  $("luhnGap").value = "4";
  $("luhnLowFreq").value = "1";
  $("luhnHighFreq").value = "999999";
  $("luhnConsolidate").value = "on";

  $("edmMode").value = "ratio";
  $("edmTarget").value = "0.25";
  $("edmPreset").value = "all";
  $("edmKeyPct").value = "15";
  $("aC").value = "1";
  $("aK").value = "1";
  $("aT").value = "1";
  $("aL").value = "1";
  $("titleW").value = "5";
  $("headingW").value = "3";
  $("O1").value = "1";
  $("O2").value = "1";
  $("O3").value = "1";
  $("O4").value = "1";

  syncAlgoVisibility();
  setStatus("ready");
}

function syncAlgoVisibility(){
  const algo = $("algo").value;
  $("luhnControls").style.display = (algo==="luhn") ? "" : "none";
  $("edmundsonControls").style.display = (algo==="edmundson") ? "" : "none";
  setStatus(algo);
}

function applyEdmPreset(){
  const p = $("edmPreset").value;
  if(p==="all"){
    $("aC").value = "1"; $("aK").value = "1"; $("aT").value = "1"; $("aL").value = "1";
  } else if(p==="ctl"){
    $("aC").value = "1"; $("aK").value = "0"; $("aT").value = "1"; $("aL").value = "1";
  } else if(p==="cueOnly"){
    $("aC").value = "1"; $("aK").value = "0"; $("aT").value = "0"; $("aL").value = "0";
  } else if(p==="locusOnly"){
    $("aC").value = "0"; $("aK").value = "0"; $("aT").value = "0"; $("aL").value = "1";
  }
}

function run(){
  const algo = $("algo").value;
  const title = $("title").value || "";
  const body = $("text").value || "";

  if(!body.trim()){
    setStatus("emptyText");
    return;
  }

  setStatus("running");

  let result = null;

  if(algo === "luhn"){
    const stopwords = normNewlines($("stopwords").value).split("\n").map(x=>x.trim()).filter(Boolean);
    const mode = $("luhnMode").value;
    const targetRaw = $("luhnTarget").value;
    let target = Number(targetRaw);
    if(mode==="ratio"){
      if(!(target>0 && target<=1)) target = 0.25;
      $("luhnTarget").value = String(target);
    } else if(mode==="count"){
      target = Math.max(1, Math.floor(target||1));
      $("luhnTarget").value = String(target);
    } else {
      target = Number.isFinite(target) ? target : 0;
      $("luhnTarget").value = String(target);
    }

    const opts = {
      stopwords,
      gap: Number($("luhnGap").value),
      lowFreq: Number($("luhnLowFreq").value),
      highFreq: Number($("luhnHighFreq").value),
      mode,
      target,
      consolidate: $("luhnConsolidate").value === "on"
    };
    result = luhnSummarize(body, opts);
    renderHighlightedOriginal(body, result.pickedInOrder);
  } else {
    applyEdmPreset(); // keep preset consistent
    const opts = {
      mode: $("edmMode").value,
      target: $("edmTarget").value,
      keyPct: $("edmKeyPct").value,
      aC: $("aC").value,
      aK: $("aK").value,
      aT: $("aT").value,
      aL: $("aL").value,
      titleW: $("titleW").value,
      headingW: $("headingW").value,
      O1: $("O1").value,
      O2: $("O2").value,
      O3: $("O3").value,
      O4: $("O4").value,
      bonusText: $("bonus").value,
      stigmaText: $("stigma").value,
      nullText: $("nullw").value,
      headingDictText: $("headdict").value
    };

    // normalize target field by mode
    if(opts.mode==="ratio"){
      let r = Number(opts.target);
      if(!(r>0 && r<=1)) r = 0.25;
      $("edmTarget").value = String(r);
      opts.target = r;
    } else {
      let n = Math.max(1, Math.floor(Number(opts.target)||1));
      $("edmTarget").value = String(n);
      opts.target = n;
    }

    result = edmundsonSummarize(title, body, opts);
    renderHighlightedOriginal(body, result.pickedInOrder);
  }

  lastResult = result;
  lastGeneratedAt = new Date();

  renderSummary(result);
  renderSentenceTable(result);
  renderDiagnostics(result);
  updateMeta();

  setStatus("done");
}

function copySummary(){
  const text = $("summary").innerText.trim();
  if(!text) return;
  navigator.clipboard.writeText(text).then(()=>{
    setStatus("copied");
    setTimeout(()=>setStatus($("algo").value), 900);
  }).catch(()=>{
    setStatus("copyFailed");
  });
}

/* =========================
   Init
   ========================= */
$("algo").addEventListener("change", syncAlgoVisibility);
$("sample").addEventListener("change", (e)=> loadSample(e.target.value));
$("edmPreset").addEventListener("change", applyEdmPreset);
$("runBtn").addEventListener("click", run);
$("copyBtn").addEventListener("click", copySummary);
$("resetBtn").addEventListener("click", resetDefaults);

const langSel = $("lang");
if(langSel){
  langSel.addEventListener("change", (e)=> setLang(e.target.value));
  langSel.value = getInitialLang();
  setLang(langSel.value);
} else {
  currentLang = getInitialLang();
  applyI18n();
}

resetDefaults();
