"use strict";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ORDER = { High: 0, Medium: 1, Low: 2 };
const CHIP_LIMIT = 12;

const $ = (id) => document.getElementById(id);
const state = { manifest: null, year: 0, month: 0, selected: null, cache: new Map(), reports: [] };

/* ---------- helpers ---------- */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function prettyDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Credential_harvesting_technique" -> {label: "Credential harvesting", kind: "technique"} */
function threat(name) {
  const parts = name.split("_");
  const last = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  let kind = "malware", label = name;
  if (last === "technique" || last === "tool" || last === "vuln") {
    kind = last;
    label = parts.slice(0, -1).join(" ");
  } else {
    label = parts.join(" ");
  }
  return { label, kind, raw: name };
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function level(n) {
  if (!n) return 0;
  if (n <= 3) return 1;
  if (n <= 8) return 2;
  if (n <= 15) return 3;
  return 4;
}

/* ---------- calendar ---------- */
function renderWeekdays() {
  $("weekdays").replaceChildren(...WEEKDAYS.map((w) => el("div", {}, w)));
}

function monthBounds() {
  const [fy, fm] = state.manifest.first.split("-").map(Number);
  const [ly, lm] = state.manifest.last.split("-").map(Number);
  return { min: fy * 12 + fm - 1, max: ly * 12 + lm - 1 };
}

function renderCalendar() {
  const { year, month } = state;
  const days = state.manifest.days;
  $("month-label").textContent = `${MONTHS[month]} ${year}`;
  const b = monthBounds(), cur = year * 12 + month;
  $("prev").disabled = cur <= b.min;
  $("next").disabled = cur >= b.max;

  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;            // Monday-first
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayIso = new Date().toISOString().slice(0, 10);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(el("div", { class: "cell pad" }));
  for (let d = 1; d <= count; d++) {
    const date = iso(year, month, d);
    const info = days[date];
    const n = info ? info.n : 0;
    const cls = ["cell", n ? `l${level(n)}` : "empty", date === state.selected && "selected", date === todayIso && "today"]
      .filter(Boolean).join(" ");
    cells.push(el("button", {
      class: cls, type: "button", disabled: !n,
      "aria-label": `${prettyDate(date)}: ${n} report${n === 1 ? "" : "s"}`,
      "aria-pressed": date === state.selected ? "true" : "false",
      onclick: () => { location.hash = date; },
    }, el("span", {}, d), n ? el("span", { class: "n" }, n) : null));
  }
  $("days").replaceChildren(...cells);
}

function shiftMonth(delta) {
  const t = state.year * 12 + state.month + delta;
  state.year = Math.floor(t / 12);
  state.month = t % 12;
  renderCalendar();
}

/* ---------- day view ---------- */
async function loadDay(date) {
  if (state.cache.has(date)) return state.cache.get(date);
  const res = await fetch(`data/days/${date}.json?v=${encodeURIComponent(state.manifest.generated_at)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()).map((e) => e.parsed);
  data.sort((a, b) => (ORDER[a.completeness] ?? 3) - (ORDER[b.completeness] ?? 3));
  state.cache.set(date, data);
  return data;
}

function chips(items, mapper) {
  const list = items.map(mapper);
  const shown = list.slice(0, CHIP_LIMIT);
  const box = el("div", { class: "chips" }, shown);
  if (list.length > CHIP_LIMIT) {
    const more = el("button", { class: "chip more", type: "button" }, `+${list.length - CHIP_LIMIT} more`);
    more.addEventListener("click", () => { more.replaceWith(...list.slice(CHIP_LIMIT)); });
    box.append(more);
  }
  return box;
}

function chip(text, cls = "", title = null) {
  return el("button", {
    class: `chip ${cls}`.trim(), type: "button", title,
    onclick: () => { $("filter").value = text; applyFilter(); $("filter").focus(); },
  }, text);
}

function facet(label, items, mapper) {
  // drop parser noise from the source data ("have more...", "<font>", single letters)
  const clean = (items || []).filter((x) => x && x !== "have more..." && x.trim().length > 1 && !/[<>]/.test(x));
  if (!clean.length) return null;
  return el("div", { class: "facet" }, el("span", { class: "facet-label" }, label), chips(clean, mapper));
}

const IOC_LABELS = { sha256: "SHA256", sha1: "SHA1", md5: "MD5", ipv4: "IP", domain: "Domains", url: "URLs", email: "Emails" };

function iocBlock(iocs) {
  if (!iocs) return null;
  const groups = Object.entries(iocs).filter(([, v]) => v && v.length);
  if (!groups.length) return null;
  const total = groups.reduce((n, [, v]) => n + v.length, 0);
  const all = groups.map(([k, v]) => `# ${IOC_LABELS[k] || k}\n${v.join("\n")}`).join("\n\n");
  const copy = el("button", { class: "copy-btn", type: "button" }, "Copy all");
  copy.addEventListener("click", async (ev) => {
    ev.preventDefault();
    try { await navigator.clipboard.writeText(all); copy.textContent = "Copied"; }
    catch { copy.textContent = "Copy failed"; }
    setTimeout(() => { copy.textContent = "Copy all"; }, 1500);
  });
  return el("details", { class: "iocs" },
    el("summary", {}, `IOCs (${total})`, copy),
    groups.map(([k, v]) => el("div", { class: "ioc-group" },
      el("div", { class: "ioc-label" }, `${IOC_LABELS[k] || k} · ${v.length}`),
      el("pre", {}, v.join("\n")))),
    el("p", { class: "ioc-note" }, "Extracted automatically from the article. Verify before blocking."));
}

function card(r) {
  const [src, ...extra] = r.links || [];
  const ttp = r.ttp_tactics !== undefined ? `ATT&CK: ${r.ttp_tactics} tactics, ${r.ttp_techniques} techniques` : null;
  const node = el("article", { class: "card" },
    el("div", { class: "card-head" },
      el("div", {},
        el("h2", {}, el("a", { href: src, target: "_blank", rel: "noopener" }, r.title)),
        el("div", { class: "source" }, host(src))),
      el("span", { class: `badge ${r.completeness}`, title: "Report completeness" }, r.completeness)),
    r.summary ? el("p", { class: "summary" }, r.summary)
      : el("p", { class: "no-summary" }, "No summary yet: open the source for details."),
    el("div", { class: "facets" },
      facet("Threats", r.threats, (t) => { const x = threat(t); return chip(x.label, x.kind, `${x.kind}: ${x.raw}`); }),
      facet("Geo", r.geo, (g) => chip(g)),
      facet("Software", r.software, (s) => chip(s)),
      facet("Languages", r.languages, (s) => chip(s)),
      facet("Crypto", [...(r.crypto || []), ...(r.wallets || [])], (s) => chip(s))),
    iocBlock(r.iocs),
    el("div", { class: "card-foot" },
      ttp ? el("span", {}, ttp) : null,
      extra.length ? el("details", { class: "links" },
        el("summary", {}, `${extra.length} related link${extra.length === 1 ? "" : "s"}`),
        el("ul", {}, extra.map((u) => el("li", {}, el("a", { href: u, target: "_blank", rel: "noopener" }, u))))) : null));
  node.dataset.search = [r.title, r.summary, ...(r.threats || []).map((t) => threat(t).label), ...(r.threats || []),
    ...(r.geo || []), ...(r.software || []), ...(r.languages || []), host(src),
    ...Object.values(r.iocs || {}).flat()].join(" ").toLowerCase();
  return node;
}

function renderDayTop(date, reports) {
  const counts = new Map();
  for (const r of reports) for (const t of r.threats || []) {
    const x = threat(t);
    if (x.kind === "technique") continue;               // show actors/malware/tools, not generic techniques
    counts.set(x.label, { n: (counts.get(x.label)?.n || 0) + 1, kind: x.kind, raw: x.raw });
  }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  $("day-top").replaceChildren(...(top.length ? [
    el("h3", {}, "Top threats this day"),
    el("div", { class: "chips" }, top.map(([label, v]) => chip(label, v.kind, `${v.n} report${v.n === 1 ? "" : "s"}`))),
  ] : []));
}

function applyFilter() {
  const q = $("filter").value.trim().toLowerCase();
  let shown = 0;
  for (const c of $("reports").children) {
    if (!c.dataset.search) continue;
    const hit = !q || c.dataset.search.includes(q);
    c.hidden = !hit;
    if (hit) shown++;
  }
  const total = state.reports.length;
  const high = state.reports.filter((r) => r.completeness === "High").length;
  $("day-sub").textContent = q
    ? `${shown} of ${total} reports match “${$("filter").value.trim()}”`
    : `${total} report${total === 1 ? "" : "s"} · ${high} high completeness`;
  const empty = $("reports").querySelector(".empty-state");
  if (empty) empty.remove();
  if (q && !shown) $("reports").append(el("div", { class: "empty-state" }, "No reports match this filter."));
}

async function selectDay(date) {
  state.selected = date;
  const [y, m] = date.split("-").map(Number);
  state.year = y; state.month = m - 1;
  renderCalendar();
  $("day-title").textContent = prettyDate(date);
  $("filter").value = "";
  if (!state.manifest.days[date]) {
    state.reports = [];
    $("day-sub").textContent = "";
    $("day-top").replaceChildren();
    $("reports").replaceChildren(el("div", { class: "empty-state" }, "No reports for this day. Pick a highlighted day in the calendar."));
    return;
  }
  $("reports").replaceChildren(el("div", { class: "skeleton" }), el("div", { class: "skeleton" }));
  try {
    const reports = await loadDay(date);
    if (state.selected !== date) return;                // user clicked elsewhere meanwhile
    state.reports = reports;
    $("reports").replaceChildren(...reports.map(card));
    renderDayTop(date, reports);
    applyFilter();
  } catch (e) {
    $("reports").replaceChildren(el("div", { class: "empty-state" }, `Could not load this day (${e.message}).`));
  }
}

/* ---------- boot ---------- */
async function init() {
  renderWeekdays();
  try {
    const res = await fetch("data/manifest.json", { cache: "no-cache" });   // always check for a newer build
    state.manifest = await res.json();
  } catch {
    $("day-title").textContent = "Could not load the data.";
    return;
  }
  const m = state.manifest;
  $("stats").textContent = `${m.total.toLocaleString("en")} reports · ${Object.keys(m.days).length} days · updated ${m.last}`;
  $("prev").addEventListener("click", () => shiftMonth(-1));
  $("next").addEventListener("click", () => shiftMonth(1));
  $("latest").addEventListener("click", () => { location.hash = m.last; });
  $("filter").addEventListener("input", applyFilter);
  window.addEventListener("hashchange", () => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (isDate(h)) selectDay(h);
  });
  const h = decodeURIComponent(location.hash.slice(1));
  selectDay(isDate(h) ? h : m.last);
}

init();
