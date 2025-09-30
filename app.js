// 1단계: 별자리 선택 시, 해당 별자리의 "연결선 시퀀스(배열의 배열)"를 불러와 표시
// 데이터 파일: constellation_lines_iau.json  (사용자가 업로드한 IAU 라인 JSON)

const DATA_URL = "constellation_lines_iau.json";

const sel = document.getElementById("sel");
const q   = document.getElementById("q");
const list = document.getElementById("list");
const summary = document.getElementById("summary");
const countEl = document.getElementById("count");
const uniqueEl = document.getElementById("unique");

let raw = {};            // { Andromeda: [[...],[...],...], ... }
let names = [];          // ["Andromeda", "Antlia", ...]
let currentName = null;  // 현재 선택된 별자리 이름

init();

async function init(){
  raw = await fetch(DATA_URL).then(r=>r.json());
  names = Object.keys(raw).sort((a,b)=>a.localeCompare(b,'en'));
  populateSelect(names);
  bindEvents();
  // 기본 선택(첫 항목)
  if (names.length){
    sel.value = names[0];
    onChangeConstellation();
  }
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

function bindEvents(){
  sel.addEventListener("change", onChangeConstellation);
  q.addEventListener("input", onSearch);
}

function onSearch(){
  const v = q.value.trim().toLowerCase();
  if (!v){
    populateSelect(names);
  } else {
    const filtered = names.filter(n => n.toLowerCase().includes(v));
    populateSelect(filtered.length ? filtered : names);
  }
  // 검색 후 첫 항목 자동 선택
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
  const sequences = raw[currentName] || [];
  renderSequences(currentName, sequences);
  // 다음 단계에서 사용할 수 있게 커스텀 이벤트도 발행
  dispatchEvent(new CustomEvent("constellation:loaded", {
    detail: { name: currentName, sequences }
  }));
}

function renderSequences(name, sequences){
  list.innerHTML = "";

  // 요약(시퀀스 개수, 고유 HIP 개수)
  const uniq = new Set();
  for (const seq of sequences){
    for (const hip of seq){ uniq.add(String(hip)); }
  }
  summary.textContent =
    `선분 시퀀스: ${sequences.length}개 · 고유 HIP: ${uniq.size.toLocaleString()}개`;
  uniqueEl.textContent = [...uniq].sort((a,b)=>+a - +b).join(", ");

  // 각 시퀀스 박스 생성
  sequences.forEach((seq, i) => {
    const div = document.createElement("div");
    div.className = "seq";
    const code = document.createElement("code");
    code.textContent = `#${(i+1).toString().padStart(2,"0")}  [ ${seq.join(", ")} ]`;
    div.appendChild(code);
    list.appendChild(div);
  });
}
