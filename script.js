const canvas = document.getElementById("skyCanvas");
const ctx = canvas.getContext("2d");
const select = document.getElementById("constellationSelect");
const tooltip = document.getElementById("tooltip");

let constellationData = {};
let starCoords = {};
let currentCoordsMap = {};
let currentLines = [];

function parseCSV(text) {
  const lines = text.trim().split(",");
  const headers = lines[0].split(",");
  const hipIdx = headers.indexOf("HIP");
  const raIdx = headers.indexOf("_RAJ2000");
  const decIdx = headers.indexOf("_DEJ2000");
  const vmagIdx = headers.indexOf("VMag");
  const bvIdx = headers.findIndex(h => h.includes("B-V"));

  const data = {};
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const hip = row[hipIdx]?.trim();
    const ra = parseFloat(row[raIdx]);
    const dec = parseFloat(row[decIdx]);
    const vmag = parseFloat(row[vmagIdx]);
    const bv = parseFloat(row[bvIdx]);

    if (hip && !isNaN(ra) && !isNaN(dec)) {
      data[hip] = { ra, dec, vmag, bv };
    }
  }

  return data;
}

function skyToCanvas({ ra, dec }) {
  const raOffset = 90;
  const raShifted = (ra - raOffset + 360) % 360;
  const x = (raShifted / 360) * canvas.width;
  const y = (1 - (dec + 90) / 180) * canvas.height;
  return { x, y };
}

function drawConstellation(lines, coordsMap) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#44f";
  ctx.lineWidth = 1.5;
  ctx.fillStyle = "#fff";

  for (const segment of lines) {
    ctx.beginPath();
    for (let i = 0; i < segment.length; i++) {
      const hip = segment[i];
      const coords = coordsMap[hip];
      if (!coords) continue;
      const { x, y } = coords;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (const segment of lines) {
    for (const hip of segment) {
      const coords = coordsMap[hip];
      if (!coords) continue;
      const { x, y } = coords;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function onSelectChange() {
  const name = select.value;
  const lines = constellationData[name];
  currentLines = lines;

  const coordsMap = {};
  for (const segment of lines) {
    for (const hip of segment) {
      if (!coordsMap[hip] && starCoords[hip]) {
        coordsMap[hip] = skyToCanvas(starCoords[hip]);
      }
    }
  }

  currentCoordsMap = coordsMap;
  drawConstellation(lines, coordsMap);
}

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
