/* Schema Line Plot — connects points that share the same "schema" with a single polyline.
 * Supports data.json in two shapes:
 *  A) Array of rows: [{schema, id?, label?, x,y? | ra,dec?, order? , ...}, ...]
 *  B) Object of arrays: { "SchemaName": [ {id?, x,y?|ra,dec?, order?}, ... ], ... }
 * Coordinates:
 *  - If x,y exist → use directly.
 *  - Else if ra,dec(deg) → convert to x = -ra, y = dec (RA increases leftward).
 *  - Scales auto-fit to all visible points.
 */

const svg = d3.select("#chart");
const W = 1200, H = 800;
const gRoot = svg.append("g");
const gGrid = gRoot.append("g").attr("class", "grid");
const gLines = gRoot.append("g");
const gPoints = gRoot.append("g");

const tooltip = document.getElementById("tooltip");
const schemaSelect = document.getElementById("schemaSelect");
const legend = document.getElementById("legend");

let rawRows = [];        // flat array of rows [{schema, x,y or ra,dec, order, ...}]
let schemas = [];        // ['Orion','Lyra',...]
let selected = null;     // current selected schema or null for "all"
let zoomBehavior;        // d3 zoom
let xScale, yScale;      // d3 scales (updated per view)
let allExtent;           // overall data extent

init();

async function init() {
  const data = await d3.json("data.json");
  rawRows = normalizeToRows(data);
  schemas = Array.from(new Set(rawRows.map(d => String(d.schema))));
  schemas.sort((a,b)=>a.localeCompare(b,'en'));

  // UI: dropdown
  schemaSelect.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = `모두 보기 (${schemas.length})`;
  schemaSelect.appendChild(optAll);
  schemas.forEach(s => {
    const o = document.createElement("option");
    o.value = s; o.textContent = s;
    schemaSelect.appendChild(o);
  });
  schemaSelect.addEventListener("change", () => {
    const v = schemaSelect.value;
    selected = (v === "__ALL__") ? null : v;
    updateScales();
    render();
    renderLegend();
  });

  // Buttons
  document.getElementById("toggleAll").addEventListener("click", ()=>{
    selected = null;
    schemaSelect.value = "__ALL__";
    updateScales(); render(); renderLegend();
  });
  document.getElementById("resetView").addEventListener("click", ()=>{
    svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
  });
  document.getElementById("downloadPNG").addEventListener("click", downloadPNG);

  // Zoom/pan
  zoomBehavior = d3.zoom()
    .scaleExtent([0.5, 20])
    .filter((event) => {
      // allow wheel always; for y-only zoom with Shift
      return !event.ctrlKey && !event.button;
    })
    .on("zoom", (event) => {
      gRoot.attr("transform", event.transform);
    });

  svg.call(zoomBehavior);

  // Compute full extent & initial scales
  updateScales(true);

  // First render
  render();
  renderLegend();
}

function normalizeToRows(data) {
  const rows = [];
  const pushRow = (schema, r) => {
    const row = { ...r, schema: String(schema) };
    // unify coordinates:
    if (Number.isFinite(row.x) && Number.isFinite(row.y)) {
      row._X = +row.x; row._Y = +row.y;
    } else if (Number.isFinite(row.ra) && Number.isFinite(row.dec)) {
      // RA increases to left, draw x = -RA to flip horizontally
      row._X = -(+row.ra);
      row._Y = +row.dec;
    } else {
      // missing coords → skip
      return;
    }
    // order fallback: keep original order if no 'order'
    if (!Number.isFinite(row.order)) row.order = null;
    rows.push(row);
  };

  if (Array.isArray(data)) {
    data.forEach((r) => {
      if (!r || r.schema == null) return;
      pushRow(r.schema, r);
    });
  } else if (data && typeof data === "object") {
    Object.entries(data).forEach(([schema, arr]) => {
      if (!Array.isArray(arr)) return;
      arr.forEach(r => pushRow(schema, r));
    });
  }
  return rows;
}

function getVisibleRows() {
  return selected ? rawRows.filter(d => d.schema === selected) : rawRows;
}

function updateScales(resetZoom=false) {
  const rows = getVisibleRows();
  if (!rows.length) return;
  const xExtent = d3.extent(rows, d => d._X);
  const yExtent = d3.extent(rows, d => d._Y);
  allExtent = { x: xExtent, y: yExtent };

  xScale = d3.scaleLinear().domain(padExtent(xExtent, 0.08)).range([80, W-40]);
  yScale = d3.scaleLinear().domain(padExtent(yExtent, 0.08)).range([H-60, 40]);

  drawGrid();

  if (resetZoom) {
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }
}

function padExtent([a,b], pad=0.1) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [0,1];
  if (a === b) return [a-1, b+1];
  const span = b - a;
  return [a - span*pad, b + span*pad];
}

function drawGrid() {
  gGrid.selectAll("*").remove();
  const xAxis = d3.axisBottom(xScale).ticks(10);
  const yAxis = d3.axisLeft(yScale).ticks(8);

  gGrid.append("g")
    .attr("transform", `translate(0, ${H-60})`)
    .call(xAxis)
    .call(g => g.selectAll("text").attr("fill","#98a9c9"))
    .call(g => g.selectAll("line").attr("stroke","#1f2a4d"))
    .call(g => g.select(".domain").attr("stroke","#24315a"));

  gGrid.append("g")
    .attr("transform", `translate(80,0)`)
    .call(yAxis)
    .call(g => g.selectAll("text").attr("fill","#98a9c9"))
    .call(g => g.selectAll("line").attr("stroke","#1f2a4d"))
    .call(g => g.select(".domain").attr("stroke","#24315a"));

  // thin grid lines
  gGrid.selectAll(".tick").select("line").attr("y2", - (H-100)).attr("x2", (d,i,node)=> {
    const parent = d3.select(node[i]).node().parentNode;
    return parent && parent.parentNode === gGrid.node() ? 0 : 0;
  });
}

function render() {
  const bySchema = d3.group(getVisibleRows(), d => d.schema);

  // Lines: one per schema, connecting points in 'order' if present, else input order
  const lineGen = d3.line()
    .x(d => xScale(d._X))
    .y(d => yScale(d._Y))
    .curve(d3.curveLinear);

  const linesSel = gLines.selectAll(".schema-line")
    .data(Array.from(bySchema, ([schema, rows]) => {
      const arr = rows.slice().sort((a,b)=>{
        if (a.order==null && b.order==null) return 0;
        if (a.order==null) return 1;
        if (b.order==null) return -1;
        return a.order - b.order;
      });
      return { schema, arr };
    }), d => d.schema);

  linesSel.enter()
    .append("path")
    .attr("class","schema-line")
    .attr("d", d => lineGen(d.arr))
    .attr("stroke", (d,i)=> d3.schemeTableau10[i % 10])
    .merge(linesSel)
    .transition().duration(200)
    .attr("d", d => lineGen(d.arr))
    .attr("opacity", d => selected && d.schema!==selected ? 0.2 : 0.95);

  linesSel.exit().remove();

  // Points
  const pointsSel = gPoints.selectAll("g.schema-points")
    .data(Array.from(bySchema, ([schema, rows]) => ({schema, rows})), d => d.schema);

  const pointsEnter = pointsSel.enter().append("g").attr("class","schema-points");
  pointsEnter.merge(pointsSel).each(function(d, i) {
    const group = d3.select(this);
    const circles = group.selectAll("circle.point").data(d.rows, r => r.id || `${r._X},${r._Y},${r.order ?? ""}`);

    circles.enter()
      .append("circle")
      .attr("class","point")
      .attr("r", 3.5)
      .attr("cx", r => xScale(r._X))
      .attr("cy", r => yScale(r._Y))
      .attr("fill", d3.schemeTableau10[i % 10])
      .on("mouseenter", (event, r) => showTip(event, r))
      .on("mousemove", (event, r) => moveTip(event))
      .on("mouseleave", hideTip)
      .merge(circles)
      .transition().duration(150)
      .attr("cx", r => xScale(r._X))
      .attr("cy", r => yScale(r._Y))
      .attr("opacity", r => selected && r.schema!==selected ? 0.25 : 0.95);

    circles.exit().remove();
  });

  pointsSel.exit().remove();
}

function showTip(event, r) {
  const lines = [];
  if (r.label) lines.push(`<b>${escapeHTML(r.label)}</b>`);
  if (r.id) lines.push(`ID: ${escapeHTML(r.id)}`);
  lines.push(`schema: ${escapeHTML(r.schema)}`);
  if (Number.isFinite(r.ra) && Number.isFinite(r.dec)) {
    lines.push(`RA: ${(+r.ra).toFixed(3)}°, Dec: ${(+r.dec).toFixed(3)}°`);
  } else {
    lines.push(`x: ${(+r._X).toFixed(3)}, y: ${(+r._Y).toFixed(3)}`);
  }
  if (r.bv != null) lines.push(`B−V: ${r.bv}`);
  if (r.vmag != null) lines.push(`Vmag: ${r.vmag}`);
  if (r.order != null) lines.push(`order: ${r.order}`);

  tooltip.innerHTML = lines.join("<br>");
  tooltip.style.display = "block";
  moveTip(event);
}
function moveTip(event){
  const pad = 12;
  tooltip.style.left = (event.clientX + pad) + "px";
  tooltip.style.top  = (event.clientY + pad) + "px";
}
function hideTip(){ tooltip.style.display = "none"; }

function renderLegend(){
  legend.innerHTML = "";
  (selected ? [selected] : schemas).forEach((s, i) => {
    const b = document.createElement("span");
    b.className = "badge" + (selected===s ? " active" : "");
    b.textContent = s;
    b.onclick = () => {
      selected = (selected===s) ? null : s;
      schemaSelect.value = selected ?? "__ALL__";
      updateScales();
      render();
      renderLegend();
    };
    legend.appendChild(b);
  });
}

function downloadPNG(){
  // Serialize SVG to a PNG via canvas
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg.node());
  const blob = new Blob([source], {type: "image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = function(){
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob)=>{
      const a = document.createElement("a");
      a.download = `schema-plot.png`;
      a.href = URL.createObjectURL(pngBlob);
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = url;
}

function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
