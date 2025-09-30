const canvas = document.getElementById("skyCanvas");
const ctx = canvas.getContext("2d");
const select = document.getElementById("constellationSelect");

let constellationData = {};
let starCoords = {};

// ✅ CSV 파서 (쉼표 구분)
function parseCSV(text) {
  const lines = text.trim().split("\n");
  
  // 첫 번째 주석줄 제거
  let headerLineIndex = 0;
  while (lines[headerLineIndex].startsWith("#") || lines[headerLineIndex].trim() === "") {
    headerLineIndex++;
  }

  const headers = lines[headerLineIndex].replace(/"/g,"").split(/[,; \t]+/).map(h => h.trim());
  console.log("📄 CSV Headers:", headers);

  const hipIdx = headers.findIndex(h => h.toUpperCase().includes("HIP"));
  const raIdx = headers.findIndex(h => h.toUpperCase().includes("RA"));
  const decIdx = headers.findIndex(h => h.toUpperCase().includes("DE"));

  if (hipIdx === -1 || raIdx === -1 || decIdx === -1) {
    alert("CSV 헤더를 찾을 수 없습니다.\nHeaders: "+headers.join(","));
    return {};
  }

  const data = {};
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith("#") || lines[i].trim() === "") continue;
    const row = lines[i].replace(/"/g,"").split(/[,; \t]+/);
    const hip = row[hipIdx]?.trim();
    const ra = parseFloat(row[raIdx]);
    const dec = parseFloat(row[decIdx]);
    if (hip && !isNaN(ra) && !isNaN(dec)) {
      data[hip] = { ra, dec };
    }
  }

  console.log("⭐ 파싱된 별 개수:", Object.keys(data).length);
  return data;
}
// ✅ 천구 좌표 → 캔버스 좌표
function skyToCanvas({ ra, dec }) {
  const x = (1 - ra / 360) * canvas.width;
  const y = (1 - (dec + 90) / 180) * canvas.height;
  return { x, y };
}

// ✅ 별자리 시각화
function drawConstellation(lines) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#44f";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "#fff";

  for (const segment of lines) {
    ctx.beginPath();
    for (let i = 0; i < segment.length; i++) {
      const hip = segment[i];
      const coords = starCoords[hip];
      if (!coords) continue;
      const { x, y } = skyToCanvas(coords);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // 별점 찍기
  for (const segment of lines) {
    for (const hip of segment) {
      const coords = starCoords[hip];
      if (!coords) continue;
      const { x, y } = skyToCanvas(coords);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ✅ 별자리 선택 이벤트
select.addEventListener("change", () => {
  const name = select.value;
  const lines = constellationData[name];
  drawConstellation(lines);
});

// ✅ 파일 로드 & 초기화
async function loadData() {
  const [jsonRes, csvRes] = await Promise.all([
    fetch("constellation_lines_iau.json"),
    fetch("vizier_data.csv")
  ]);

  constellationData = await jsonRes.json();
  const csvText = await csvRes.text();
  starCoords = parseCSV(csvText);

  // 셀렉트 박스 채우기
  for (const name of Object.keys(constellationData).sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  // 기본 선택 표시
  select.value = "Orion";
  drawConstellation(constellationData["Orion"]);
}

loadData();
