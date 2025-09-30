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

// CSV 파서
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");

  const hipIdx = headers.findIndex(h => h.trim().toUpperCase() === "HIP");
  const raIdx = headers.findIndex(h => h.toUpperCase().includes("RA"));
  const decIdx = headers.findIndex(h => h.toUpperCase().includes("DEC") || h.toUpperCase().includes("DE"));
  const vmagIdx = headers.findIndex(h => h.toUpperCase().includes("VMAG"));
  const bvIdx = headers.findIndex(h => h.toUpperCase().includes("B-V"));

  if (hipIdx === -1 || raIdx === -1 || decIdx === -1) {
    alert("필수 CSV 헤더(HIP, RA, DEC)를 찾을 수 없습니다.");
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

// 중심 기준 Canvas 좌표
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

// RA 평균 (360 wrap-around 보정)
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

// 별자리 선택 시
function onSelectChange() {
  offsetX = 0;
  offsetY = 0;

  const name = select.value;
  const lines = constellationData[name];
  currentLines = lines;

  const raList = [], decList = [];

  for (const segment of lines) {
    for (const hip of segment) {
      const star = starCoords[hip];
      if (star) {
        raList.push(star.ra);
        decList.push(star.dec);
      }
    }updateStarTable(lines);
  }
function updateStarTable(lines) {
  const tbody = document.querySelector("#starTable tbody");
  tbody.innerHTML = "";

  const hips = new Set();
  for (const segment of lines) {
    for (const hip of segment) {
      if (hips.has(hip)) continue;
      hips.add(hip);
      const star = starCoords[hip];
      if (!star) continue;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${hip}</td>
        <td>${star.vmag ?? "N/A"}</td>
        <td>${star.bv ?? "N/A"}</td>
      `;
      tbody.appendChild(tr);
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

// 마우스 오버 툴팁
function showTooltipAt(x, y, pageX, pageY) {
  let found = null;

  for (const segment of currentLines) {
    for (const hip of segment) {
      const coord = currentCoordsMap[hip];
      if (!coord) continue;

      const dx = coord.x - x;
      const dy = coord.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 8) {
        found = { hip, ...starCoords[hip], screen: coord };
        break;
      }
    }
    if (found) break;
  }

  if (found) {
    tooltip.style.display = "block";
    tooltip.style.left = `${pageX + 10}px`;
    tooltip.style.top = `${pageY + 10}px`;
    tooltip.innerHTML = `
      <b>HIP:</b> ${found.hip}<br>
      <b>Vmag:</b> ${found.vmag ?? "N/A"}<br>
      <b>B−V:</b> ${found.bv ?? "N/A"}
    `;
  } else {
    tooltip.style.display = "none";
  }
}
canvas.addEventListener("touchend", (e) => {
  if (!e.changedTouches || e.changedTouches.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const touch = e.changedTouches[0];
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;

  let found = null;

  for (const segment of currentLines) {
    for (const hip of segment) {
      const coord = currentCoordsMap[hip];
      if (!coord) continue;

      const dx = coord.x - x;
      const dy = coord.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 10) {
        found = { hip, ...starCoords[hip], screen: coord };
        break;
      }
    }
    if (found) break;
  }

  if (found) {
    tooltip.style.display = "block";
    tooltip.style.left = `${touch.pageX + 10}px`;
    tooltip.style.top = `${touch.pageY + 10}px`;
    tooltip.innerHTML = `
      <b>HIP:</b> ${found.hip}<br>
      <b>Vmag:</b> ${found.vmag ?? "N/A"}<br>
      <b>B−V:</b> ${found.bv ?? "N/A"}
    `;
  } else {
    tooltip.style.display = "none";
  }
});

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  showTooltipAt(x, y, e.pageX, e.pageY);
});

// 커서 기준 확대/축소
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const zoomIntensity = 0.1;
  const delta = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
  const newScale = Math.max(0.2, Math.min(scale * delta, 5.0));

  if (newScale === scale) return;

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

  const baseScale = canvas.height / 180;
  const dx = (mouseX - canvas.width / 2 - offsetX) / (baseScale * scale);
  const dy = (canvas.height / 2 - mouseY - offsetY) / (baseScale * scale);

  scale = newScale;

  offsetX = mouseX - canvas.width / 2 - dx * baseScale * scale;
  offsetY = mouseY - canvas.height / 2 + dy * baseScale * scale;

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


let pinchStartDist = null;
let pinchStartScale = 1;
let pinchCenter = null;

canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    pinchStartDist = getTouchDistance(e.touches);
    pinchStartScale = scale;
    pinchCenter = getTouchCenter(e.touches);
  }
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && pinchStartDist && pinchCenter) {
    const newDist = getTouchDistance(e.touches);
    const ratio = newDist / pinchStartDist;
    const newScale = Math.max(0.2, Math.min(pinchStartScale * ratio, 5.0));

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

    const baseScale = canvas.height / 180;

    const dx = (pinchCenter.x - canvas.width / 2 - offsetX) / (baseScale * scale);
    const dy = (canvas.height / 2 - pinchCenter.y - offsetY) / (baseScale * scale);

    scale = newScale;

    offsetX = pinchCenter.x - canvas.width / 2 - dx * baseScale * scale;
    offsetY = canvas.height / 2 - pinchCenter.y + dy * baseScale * scale;

    // 재계산 및 렌더링
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

    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener("touchend", () => {
  pinchStartDist = null;
  pinchCenter = null;
});

// 거리 계산 함수
function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// 두 손가락 중앙 좌표
function getTouchCenter(touches) {
  const rect = canvas.getBoundingClientRect();
  const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
  const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
  return { x, y };
}

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
