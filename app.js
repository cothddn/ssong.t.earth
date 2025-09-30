const canvas = document.getElementById("skyCanvas");
const ctx = canvas.getContext("2d");
const select = document.getElementById("constellationSelect");

let constellationData = {};
let starCoords = {};

// CSV 파싱 함수
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  const hipIdx = headers.indexOf("HIP");
  const raIdx = headers.indexOf("RA(ICRS)");
  const decIdx = headers.indexOf("DE(ICRS)");

  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const hip = row[hipIdx];
    const ra = parseFloat(row[raIdx]);
    const dec = parseFloat(row[decIdx]);
    if (hip && !isNaN(ra) && !isNaN(dec)) {
      data[hip] = { ra, dec };
    }
  }
  return data;
}

// 좌표를 캔버스로 매핑
function skyToCanvas({ ra, dec }) {
  // 단순히 정규화해서 시각화
  const x = (1 - ra / 360) * canvas.width; // 오른쪽이 RA=0
  const y = (1 - (dec + 90) / 180) * canvas.height;
  return { x, y };
}

// 별자리 그리기
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
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  // 별 점 찍기
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

// 별자리 선택 시
select.addEventListener("change", () => {
  const name = select.value;
  const lines = constellationData[name];
  drawConstellation(lines);
});

// 데이터 불러오기
async function loadData() {
  const [jsonRes, csvRes] = await Promise.all([
    fetch("data/constellation_lines_iau.json"),
    fetch("data/vizier_data.csv")
  ]);
  constellationData = await jsonRes.json();
  const csvText = await csvRes.text();
  starCoords = parseCSV(csvText);

  // 드롭다운 채우기
  for (const name of Object.keys(constellationData).sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  // 기본 표시
  select.value = "Orion";
  drawConstellation(constellationData["Orion"]);
}

loadData();
