const canvas = document.getElementById("skyCanvas");
const ctx = canvas.getContext("2d");
const select = document.getElementById("constellationSelect");
const tooltip = document.getElementById("tooltip");

let constellationData = {};
let starCoords = {};
let currentCoordsMap = {};
let currentLines = [];

let scale = 1.0;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let lastMouse = null;

// CSV 파서: 다양한 포맷 대응
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

// 중심 기준 canvas 좌표 계산 + 화면 offset 적용
function skyToCanvasCentered({ ra, dec }, centerRA, centerDec) {
  let dx = ra - centerRA;
  if (dx > 180) dx -= 360;
  if (dx < -180) dx += 360;

  const dy = dec - centerDec;
  const baseScale = canvas.height / 180;

  const x = canvas.width / 2 + dx * baseScale * scale + offsetX;
  const y = canvas.height / 2 - dy * baseScale * scale + offsetY;

  return { x, y };
}

// RA 평균 (wrap-around 보정 포함)
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

// 별자리 그리기
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

// 별자리 선택 시 처리
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

// 마우스 오버: 툴팁 표시
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

// 확대/축소
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // 확대 비율 계산
  const zoomIntensity = 0.1;
  const delta = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
  const newScale = Math.max(0.2, Math.min(scale * delta, 5.0));

  if (newScale === scale) return; // 변경 없으면 중단

  // 중심 별자리 기준 좌표 계산
  const name = select.value;
  const lines = constellationData[name];

  const raList = [], decList = [];
  for (const segment of lines) {
    for (const hip of segment) {
      const star = starCoords[hip];
      if (star) {
        raList.push(star.ra);
        decList.push(star.dec);
      }
    }
  }

  const centerRA = averageRA(raList);
  const centerDec = decList.reduce((a, b) => a + b, 0) / decList.length;

  // 🔁 마우스 위치 기준 RA/Dec 계산
  const baseScale = canvas.height / 180;
  const dxLogical = (mouseX - canvas.width / 2 - offsetX) / (baseScale * scale);
  const dyLogical = (canvas.height / 2 - mouseY - offsetY) / (baseScale * scale);

  // scale 업데이트
  scale = newScale;

  // 새 offset 재계산 → 커서 위치 논리좌표 고정
  offsetX = mouseX - canvas.width / 2 - dxLogical * baseScale * scale;
  offsetY = mouseY - canvas.height / 2 + dyLogical * baseScale * scale;

  // 다시 그리기
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
});

// 드래그 이동
let dragDx = 0;
let dragDy = 0;

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastMouse = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  dragDx = 0;
  dragDy = 0;
});

canvas.addEventListener("mouseleave", () => {
  isDragging = false;
  dragDx = 0;
  dragDy = 0;
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  dragDx = e.clientX - lastMouse.x;
  dragDy = e.clientY - lastMouse.y;
  lastMouse = { x: e.clientX, y: e.clientY };
});

function animate() {
  if (dragDx !== 0 || dragDy !== 0) {
    offsetX += dragDx;
    offsetY += dragDy;
    drawConstellation(currentLines, currentCoordsMap);
    dragDx = 0;
    dragDy = 0;
  }

  requestAnimationFrame(animate);
}

animate(); // 초기 실행

// 데이터 로드
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
