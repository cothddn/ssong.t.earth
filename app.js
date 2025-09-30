const DATA_URL = "constellation_lines_iau.json";

const sel = document.getElementById("sel");
const q   = document.getElementById("q");
const list = document.getElementById("list");
const summary = document.getElementById("summary");
const countEl = document.getElementById("count");
const uniqueEl = document.getElementById("unique");
const alertBox = document.getElementById("alert");
const fileInput = document.getElementById("file");

let raw = {};
let names = [];
let currentName = null;

init();

async function init(){
  try {
    raw = await loadJSON(DATA_URL);
    hydrate(raw);
  } catch (err) {
    showAlert([
      "기본 JSON을 불러오지 못했습니다.",
      `원인: ${err.message}`,
      "확인하세요:",
      "• GitHub Pages 또는 로컬 서버(http://)에서 열었는지 (file://는 불가)",
      "• index.html과 같은 폴더에 constellation_lines_iau.json가 있는지",
      "• 파일 이름/대소문자가 정확한지"
    ].join("<br>"));
  }
  bindEvents();
}

function bindEvents(){
  sel.addEventListener("change", onChangeConstellation);
  q.addEventListener("input", onSearch);
  fileInput.addEventListener("change", onPickFile);
  // 디버깅 편의: 로드 이벤트 로그
  window.addEventListener("constellation:loaded", (e)=>{
    console.log("Loaded:", e.detail.name, e.detail);
  });
}

async function onPickFile(e){
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    const data = JSON.parse(txt);
    clearAlert();
    hydrate(data);
  } catch (err) {
    showAlert("선택한 파일을 읽는 중 오류: " + err.message);
  }
}

function hydrate(data){
  // 기대하는 구조는 { "Andromeda": [ [HIP, HIP, ...], [ ... ], ... ], ... }
  // 방어적으로 지원: 배열로 된 경우, 첫 원소가 dict라면 변환 시도
  if (Array.isArray(data)) {
    // 사용자가 다른 포맷을 넣었을 가능성 → 이름 키 감지 불가
    throw new Error("예상치 못한 데이터 형식(배열). 최상위가 객체여야 합니다: { ConstName: [[...], ...], ... }");
  }
  raw = data;
  names = Object.keys(raw).sort((a,b)=>a.localeCompare(b,'en'));
  if (!names.length) throw new Error("데이터에 별자리 키가 없습니다.");

  populateSelect(names);
  // 기본 선택
  sel.value = names[0];
  onChangeConstellation();
}

async function loadJSON(url){
  const res = await fetch(url, {cache:"no-cache"});
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} - ${res.statusText}`);
  }
  return res.json();
}

function populateSelect(arr){
  sel.innerHTML = "";
  for (const name of arr){
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  countEl.textContent = `총 별자리: ${arr.length.toLocaleString()}`;
}

function onSearch(){
  const v = q.value.trim().toLowerCase();
  if (!v){
    populateSelect(names);
  } else {
    const filtered = names.filter(n => n.toLowerCase().includes(v));
    populateSelect(filtered.length ? filtered : names);
  }
  if (sel.options.length){
    sel.value = sel.options[0].value;
    onChangeConstellation();
  } else {
    list.innerHTML = "";
    summary.textContent = "결과 없음";
    uniqueEl.textContent = "";
  }
}

function onChangeConstellation(){
  currentName = sel.value;
  const sequences = normalizeSequences(raw[currentName]);
  renderSequences(currentName, sequences);
  dispatchEvent(new CustomEvent("constellation:loaded", {
    detail: { name: currentName, sequences }
  }));
}

function normalizeSequences(val){
  // 기대: Array<Array<string|number>>
  // 혹시 {lines:[...]} 같이 감싸져 있으면 꺼내기
  if (!Array.isArray(val)) {
    if (val && Array.isArray(val.lines)) return val.lines;
    if (val && Array.isArray(val.sequences)) return val.sequences;
    throw new Error("선택된 별자리 데이터 형식이 올바르지 않습니다.");
  }
  // 모두 문자열로 통일
  return val.map(seq => Array.isArray(seq) ? seq.map(x => String(x)) : []);
}

function renderSequences(name, sequences){
  list.innerHTML = "";

  const uniq = new Set();
  for (const seq of sequences){
    for (const hip of seq){ uniq.add(String(hip)); }
  }
  summary.textContent = `선분 시퀀스: ${sequences.length}개 · 고유 HIP: ${uniq.size.toLocaleString()}개`;
  uniqueEl.textContent = [...uniq].sort((a,b)=>+a - +b).join(", ");

  sequences.forEach((seq, i) => {
    const div = document.createElement("div");
    div.className = "seq";
    const code = document.createElement("code");
    code.textContent = `#${(i+1).toString().padStart(2,"0")}  [ ${seq.join(", ")} ]`;
    div.appendChild(code);
    list.appendChild(div);
  });
}

function showAlert(html){
  alertBox.innerHTML = html;
  alertBox.classList.remove("hidden");
}
function clearAlert(){
  alertBox.innerHTML = "";
  alertBox.classList.add("hidden");
}
