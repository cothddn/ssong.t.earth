const canvas = document.getElementById("skyCanvas");
const ctx = canvas.getContext("2d");
const select = document.getElementById("constellationSelect");
const tooltip = document.getElementById("tooltip");

let constellationData = {};
let starCoords = {};
let currentCoordsMap = {};
let currentLines = [];

// 📌 유연한 CSV 파서
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");

  const hipIdx = headers.findIndex(h => h.trim().toUpperCase() === "HIP");
  const raIdx = headers.findIndex(h => h.toUpperCase().includes("RA"));
  const decIdx = headers.findIndex(h => h.toUpperCase().includes("DEC") || h.toUpperCase().includes("DE"));
  const vmagIdx = headers.findIndex(h => h.toUpperCase().includes("VMAG"));
  const bvIdx = headers.findIndex(h => h.toUpperCase().includes("B-V"));

  if (hipIdx === -1 || raIdx === -1 || decIdx === -1) {
    alert("필수 CSV 헤더(HIP, RA, DEC)를 찾을 수 없습니다.\nHeaders: " + headers.join(", "));
    return {};
  }

  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const hip = row[hipIdx]?.trim();
    const ra = parseFloat(row[raIdx]);
    const dec = parseFloat(row[decIdx]);
    const vmag = vmagIdx !== -1 ? parseFloat(row[vmagIdx]) : null;
    const bv = bvIdx !== -1 ? parseFloat(row[bvIdx]) : null;

    if (hip && !isNaN(ra) && !isNaN(dec)) {
      data[hip] = { ra, dec, vmag, bv };
    }
  }

  return data;
}

// 📌 중심 기준으로 변환된 RA/DEC → canvas x/y
function skyToCanvasCentered({ ra, dec }, centerRA, centerDec) {
  let dx = ra - centerRA;
  if (dx > 180) dx -= 360;
  if (dx < -180) dx += 360;

  const dy = dec - centerDec;
  const scale = canvas.height / 180; // 1도 = scale px

  const x = canvas.width / 2 + dx * scale;
  const y = canvas.height / 2 - dy * scale;

  return { x, y };
}

// 📌 RA 평균 (wrap-around 보정 포함)
function averageRA(ras) {
  let x = 0, y = 0;
  for (const ra of ras) {
    const rad = (ra / 180) * Math.PI;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }
  const avgAngle = Math.atan2(y, x);
  return (avgAngle * 180 / Math.PI + 360) % 360;
}

// 📌 별자리 시각화
function drawConstellation(lines, coordsMap) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#44f";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "#fff";

  for (const segment of lines) {
    ctx.beginPath();
    let prev = null;

    for (let i = 0; i < segment.length; i++) {
      const hip = segment[i];
      const coord = coordsMap[hip];
      if (!coord) continue;

      if (!prev) {
        ctx.moveTo(coord.x, coord.y);
      } else {
        const dx = Math.abs(prev.x - coord.x);
        if (dx < canvas.width / 2) {
          ctx.lineTo(coord.x, coord.y);
        } else {
          ctx.moveTo(coord.x, coord.y);
        }
      }

      prev = coord;
    }

    ctx.stroke();
  }

  // 별 점 찍기
  for (const segment of lines) {
    for (const hip of segment) {
      const coord = coordsMap[hip];
      if (!coord) continue;
      ctx.beginPath();
      ctx.arc(coord.x, coord.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// 📌 별자리 선택 시
function onSelectChange() {
  const name = select.value;
  const lines = constellationData[name];
  currentLines = lines;

  const raList = [];
  const decList = [];

  for (const segment of lines) {
    for (const hip of segment) {
      const star = starCoords[hip];
      if (star) {
        raList.push(star.ra);
        decList.push(star.dec);
      }
    }
  }

  if (raList.length === 0) return;

  const centerRA = averageRA(raList);
  const centerDec = decList.reduce((a, b) => a + b, 0) / decList.length;

  const coordsMap = {};
  for (const segment of lines) {
    for (const hip of segment) {
      const star = starCoords[hip];
      if (star && !coordsMap[hip]) {
        coordsMap[hip] = skyToCanvasCentered(star, centerRA, centerDec);
      }
    }
  }

  currentCoordsMap = coordsMap;
  drawConstellation(lines, coordsMap);
}

// 📌 마우스 호버 → 툴팁 표시
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  let found = null;

  for (const segment of currentLines) {
    for (const hip of segment) {
      const coord = currentCoordsMap[hip];
      if (!coord) continue;

      const dx = coord.x - mouseX;
      const dy = coord.y - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        found = { hip, ...starCoords[hip], screen: coord };
        break;
      }
    }
    if (found) break;
  }

  if (found) {
    tooltip.style.display = "block";
    tooltip.style.left = `${e.pageX + 10}px`;
    tooltip.style.top = `${e.pageY + 10}px`;
    tooltip.innerHTML = `
      <b>HIP:</b> ${found.hip}<br>
      <b>Vmag:</b> ${found.vmag ?? "N/A"}<br>
      <b>B−V:</b> ${found.bv ?? "N/A"}
    `;
  } else {
    tooltip.style.display = "none";
  }
});

// 📌 초기 로드
async function loadData() {
  const [jsonRes, csvRes] = await Promise.all([
    fetch("constellation_lines_iau.json"),
    fetch("vizier_data.csv")
  ]);

  constellationData = await jsonRes.json();
  const csvText = await csvRes.text();
  starCoords = parseCSV(csvText);

  for (const name of Object.keys(constellationData).sort()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  }

  select.addEventListener("change", onSelectChange);
  select.value = "Orion";
  onSelectChange();
}

loadData();
