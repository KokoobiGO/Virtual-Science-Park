/*
 * The deck engine: scaling, slide transitions, builds, the shared-element
 * morph, per-slide animations, notes, the presenter window and the overview.
 * No libraries: everything runs offline from this folder.
 */
(() => {
  "use strict";

  const W = 1920;
  const H = 1080;
  const NS = "http://www.w3.org/2000/svg";
  const cfg = window.PITCH_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const stage = $("#stage");
  const slides = $$(".slide", stage);
  const N = slides.length;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  const EASE_IO = "cubic-bezier(0.65, 0, 0.35, 1)";
  const STAGGER = 70;

  let scale = 1;
  let index = -1;
  let step = 0;
  let lastNav = 0;
  let started = null;
  const hooks = {};

  /* ---------------------------------------------------------------- */
  /* Setup                                                             */
  /* ---------------------------------------------------------------- */

  function fit() {
    const vw = innerWidth;
    const vh = innerHeight;
    scale = Math.min(vw / W, vh / H);
    const x = (vw - W * scale) / 2;
    const y = (vh - H * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  function applyConfig() {
    $$("[data-config]").forEach((el) => {
      const v = cfg[el.dataset.config];
      if (typeof v === "string" && v.trim()) el.textContent = v.trim();
    });
    $$("[data-config-block]").forEach((el) => {
      const v = cfg[el.dataset.configBlock];
      if (!v) return;
      const val = $(".v", el);
      if (v.value) {
        val.textContent = v.value;
        val.classList.remove("muted");
      }
      if (v.text) $("p", el).textContent = v.text;
    });
  }

  // Wrap every word of a headline so it can rise out of its own line.
  function split(el) {
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(" "));
              return;
            }
            const w = document.createElement("span");
            w.className = "w";
            const wi = document.createElement("span");
            wi.className = "wi";
            wi.textContent = part;
            w.appendChild(wi);
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== "BR") {
          walk(n);
        }
      });
    };
    walk(el);
  }

  function stepsOf(slide) {
    if (slide._steps == null) {
      slide._steps = Math.max(0, ...$$("[data-step]", slide).map((e) => +e.dataset.step || 0));
    }
    return slide._steps;
  }

  /* ---------------------------------------------------------------- */
  /* Element animations                                                */
  /* ---------------------------------------------------------------- */

  const SEL = "[data-split],[data-a],[data-count],[data-bar],[data-draw]";

  function targets(root) {
    const list = root.matches(SEL) ? [root] : [];
    $$(SEL, root).forEach((el) => list.push(el));
    return list.filter((el) => !el.closest(".pending"));
  }

  function play(root, dir, base) {
    let i = 0;
    for (const el of targets(root)) {
      const d = base + i * STAGGER + (+el.dataset.d || 0);
      if (el.hasAttribute("data-split")) {
        words(el, dir, d);
        i += 2;
      } else if (el.hasAttribute("data-a") && rise(el, dir, d)) {
        i += 1;
      }
      if (el.hasAttribute("data-count")) countUp(el, d + 150);
      if (el.hasAttribute("data-bar")) bar(el, d + 250);
      if (el.hasAttribute("data-draw")) draw(el, d + 300);
    }
  }

  function rise(el, dir, delay) {
    const kind = el.dataset.a || "up";
    if (kind === "none") return false;
    const y = dir < 0 ? -30 : 30;
    let kf;
    if (reduce || kind === "fade") {
      kf = [{ opacity: 0 }, { opacity: 1 }];
    } else if (kind === "scale") {
      kf = [
        { opacity: 0, transform: "translateY(24px) scale(0.965)", filter: "blur(8px)" },
        { opacity: 1, transform: "none", filter: "blur(0px)" },
      ];
    } else if (kind === "left") {
      kf = [
        { opacity: 0, transform: "translateX(-40px)", filter: "blur(6px)" },
        { opacity: 1, transform: "none", filter: "blur(0px)" },
      ];
    } else {
      kf = [
        { opacity: 0, transform: `translateY(${y}px)`, filter: "blur(6px)" },
        { opacity: 1, transform: "none", filter: "blur(0px)" },
      ];
    }
    el.animate(kf, {
      duration: reduce ? 250 : kind === "fade" ? 1100 : 1000,
      delay: reduce ? 0 : delay,
      easing: EASE,
      fill: "backwards",
    });
    return true;
  }

  function words(el, dir, delay) {
    $$(".wi", el).forEach((w, j) => {
      w.animate(
        reduce
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [{ transform: `translateY(${dir < 0 ? -112 : 112}%)` }, { transform: "translateY(0)" }],
        { duration: reduce ? 250 : 1100, delay: reduce ? 0 : delay + j * 30, easing: EASE, fill: "backwards" },
      );
    });
  }

  function countUp(el, delay) {
    const raw = el.dataset.count;
    const to = parseFloat(raw);
    const dec = (raw.split(".")[1] || "").length;
    const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    if (reduce) {
      el.textContent = fmt(to);
      return;
    }
    const token = (el._count = (el._count || 0) + 1);
    const dur = 1500;
    const t0 = performance.now() + delay;
    el.textContent = fmt(0);
    const tick = (t) => {
      if (el._count !== token) return;
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(p >= 1 ? to : Math.round(to * e * 10 ** dec) / 10 ** dec);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function bar(el, delay) {
    const v = parseFloat(getComputedStyle(el).getPropertyValue("--v")) || 1;
    el.animate([{ transform: "scaleX(0)" }, { transform: `scaleX(${v})` }], {
      duration: reduce ? 1 : 1500,
      delay: reduce ? 0 : delay,
      easing: EASE_IO,
      fill: "backwards",
    });
  }

  function draw(el, delay) {
    const L = typeof el.getTotalLength === "function" ? el.getTotalLength() : +(el.dataset.len || 26);
    el.animate(
      [
        { strokeDasharray: `${L}`, strokeDashoffset: L },
        { strokeDasharray: `${L}`, strokeDashoffset: 0 },
      ],
      { duration: reduce ? 1 : 900, delay: reduce ? 0 : delay, easing: EASE_IO, fill: "backwards" },
    );
  }

  /* ---------------------------------------------------------------- */
  /* Slide changes                                                     */
  /* ---------------------------------------------------------------- */

  function show(n, opts = {}) {
    n = Math.max(0, Math.min(N - 1, n));
    if (n === index) return;
    const dir = opts.dir ?? (n > index ? 1 : -1);
    const from = index >= 0 ? slides[index] : null;
    const to = slides[n];
    const prev = index;
    index = n;
    const built = opts.built ?? false;
    step = built ? stepsOf(to) : 0;

    slides.forEach((s) => {
      if (s !== from && s !== to && s.classList.contains("is-leaving")) finishLeave(s);
    });
    if (from) leave(from, dir);
    const morphing = prev === 0 && n > 0 && !reduce;
    enter(to, dir, built, !from ? 150 : morphing ? 520 : 260);
    chrome(prev, n, dir);
    lastNav = performance.now();
    try {
      history.replaceState(null, "", `#${n + 1}`);
    } catch {
      /* file:// in some browsers */
    }
    syncNotes();
  }

  function enter(slide, dir, built, base) {
    slide.getAnimations({ subtree: true }).forEach((a) => {
      if (a.constructor === Animation) a.cancel();
    });
    slide._leave = null;
    slide.classList.remove("is-leaving");
    slide.classList.add("is-active");
    $$("[data-step]", slide).forEach((el) => el.classList.toggle("pending", !built && +el.dataset.step > 0));
    play(slide, dir, base);
    hooks[slide.id]?.enter?.(slide, { dir, built, base });
  }

  function leave(slide, dir) {
    slide.classList.add("is-leaving");
    slide.classList.remove("is-active");
    const a = slide.animate(
      reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: "none", filter: "blur(0px)" },
            { opacity: 0, transform: `translateY(${-dir * 44}px) scale(0.985)`, filter: "blur(10px)" },
          ],
      { duration: reduce ? 200 : 480, easing: "cubic-bezier(0.4, 0, 0.7, 0.2)", fill: "forwards" },
    );
    slide._leave = a;
    a.onfinish = () => finishLeave(slide);
  }

  function finishLeave(slide) {
    if (slide === slides[index]) return;
    slide.classList.remove("is-leaving", "is-active");
    if (slide._leave) slide._leave.cancel();
    slide._leave = null;
  }

  function reveal(slide, k) {
    const els = $$(`[data-step="${k}"]`, slide);
    els.forEach((el) => el.classList.remove("pending"));
    let i = 0;
    for (const el of els) {
      const d = i * STAGGER + (+el.dataset.d || 0);
      if (!el.hasAttribute("data-a") && !el.hasAttribute("data-split")) rise(el, 1, d);
      play(el, 1, d);
      i += 1;
    }
    hooks[slide.id]?.step?.(slide, k);
  }

  function conceal(slide, k) {
    $$(`[data-step="${k}"]`, slide).forEach((el) => {
      const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 1 : 220, easing: "ease-out", fill: "forwards" });
      a.onfinish = () => {
        el.classList.add("pending");
        a.cancel();
      };
    });
  }

  function next() {
    startClock();
    if (index < 0) return show(0);
    const s = slides[index];
    if (step < stepsOf(s)) {
      step += 1;
      reveal(s, step);
      syncNotes();
      return;
    }
    if (index < N - 1) show(index + 1, { dir: 1 });
  }

  function prev() {
    startClock();
    const s = slides[index];
    if (step > 0) {
      conceal(s, step);
      step -= 1;
      syncNotes();
      return;
    }
    if (index > 0) show(index - 1, { dir: -1, built: true });
  }

  /* ---------------------------------------------------------------- */
  /* Chrome: section, counter, progress, the brand morph               */
  /* ---------------------------------------------------------------- */

  const brand = $("#brand");
  const brandDiv = $("#brand-div");
  const section = $("#section");
  const counter = $("#counter");
  const progress = $("#progress");

  function roll(el, html, dir) {
    const cur = el.lastElementChild;
    if (cur && cur.innerHTML === html) return;
    [...el.children].forEach((c) => {
      if (c !== cur) c.remove();
    });
    const nu = document.createElement("span");
    nu.innerHTML = html;
    el.appendChild(nu);
    if (!cur) return;
    if (reduce) {
      cur.remove();
      return;
    }
    cur
      .animate(
        [
          { transform: "translateY(0)", opacity: 1 },
          { transform: `translateY(${-dir * 100}%)`, opacity: 0 },
        ],
        { duration: 600, easing: EASE, fill: "forwards" },
      )
      .finished.then(() => cur.remove())
      .catch(() => {});
    nu.animate(
      [
        { transform: `translateY(${dir * 100}%)`, opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: 750, delay: 90, easing: EASE, fill: "backwards" },
    );
  }

  function chrome(prevIndex, n, dir) {
    const s = slides[n];
    const label = s.dataset.section ? `<b>${s.dataset.num || ""}</b>${s.dataset.section}` : "";
    roll(section, label, dir);
    roll(counter, String(n + 1).padStart(2, "0"), dir);
    [...progress.children].forEach((seg, i) => {
      seg.classList.toggle("done", i < n);
      seg.classList.toggle("now", i === n);
    });
    const wantBrand = n > 0;
    if (wantBrand && prevIndex === 0 && !reduce) morphBrand();
    else brand.classList.toggle("off", !wantBrand);
    brandDiv.style.opacity = wantBrand && label ? "1" : "0";
  }

  // The title on slide 1 flies into the corner and becomes the brand mark.
  function morphBrand() {
    const src = $("#title-mark");
    const sr = stage.getBoundingClientRect();
    const a = src.getBoundingClientRect();
    brand.style.transition = "none";
    brand.classList.remove("off");
    brand.style.opacity = "0";
    const b = brand.getBoundingClientRect();
    if (!a.width || !b.width) {
      brand.style.opacity = "";
      brand.style.transition = "";
      return;
    }
    $$(".morph-clone", stage).forEach((c) => c.remove());
    const clone = src.cloneNode(true);
    clone.removeAttribute("id");
    clone.removeAttribute("data-split");
    clone.classList.add("morph-clone");
    Object.assign(clone.style, {
      position: "absolute",
      left: `${(a.left - sr.left) / scale}px`,
      top: `${(a.top - sr.top) / scale}px`,
      margin: "0",
      zIndex: "30",
      transformOrigin: "0 0",
      pointerEvents: "none",
    });
    stage.appendChild(clone);
    src.style.visibility = "hidden";
    const k = b.width / a.width;
    const dx = (b.left - a.left) / scale;
    const dy = (b.top + b.height / 2 - (a.top + (a.height * k) / 2)) / scale;
    const anim = clone.animate(
      [{ transform: "translate(0px, 0px) scale(1)" }, { transform: `translate(${dx}px, ${dy}px) scale(${k})` }],
      { duration: 1000, easing: "cubic-bezier(0.7, 0, 0.2, 1)", fill: "forwards" },
    );
    anim.onfinish = () => {
      brand.style.opacity = "";
      requestAnimationFrame(() => (brand.style.transition = ""));
      clone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" }).onfinish = () => clone.remove();
      src.style.visibility = "";
    };
  }

  /* ---------------------------------------------------------------- */
  /* Per-slide animations                                              */
  /* ---------------------------------------------------------------- */

  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 4 · Many scattered opportunities pass one profile; six become the week.
  hooks["s-flow"] = {
    enter(slide, { built, base }) {
      const box = $("#funnel", slide);
      $$(".dot", box).forEach((d) => d.remove());
      if (built || reduce) return;
      const rand = rng(11);
      const lens = $(".f-lens", box);
      const list = $(".f-list", box);
      const rows = $$(".f-row", box);
      const lx = lens.offsetLeft + lens.offsetWidth / 2;
      const ly = lens.offsetTop + lens.offsetHeight / 2;
      const ends = rows.map((r) => {
        const d = $(".f-dot", r);
        return { x: list.offsetLeft + d.offsetLeft + d.offsetWidth / 2, y: list.offsetTop + d.offsetTop + d.offsetHeight / 2 };
      });
      const total = 72;
      const keep = [5, 14, 23, 37, 49, 61];
      for (let k = 0; k < total; k++) {
        const dot = document.createElement("i");
        dot.className = "dot";
        const sx = 34 + rand() * 400;
        const sy = 30 + rand() * 236;
        const jx = lx + (rand() - 0.5) * 70;
        const jy = ly + (rand() - 0.5) * 90;
        const at = (x, y, s = 1) => `translate(${x}px, ${y}px) scale(${s})`;
        const ti = keep.indexOf(k);
        box.appendChild(dot);
        if (ti < 0) {
          dot.animate(
            [
              { transform: at(sx, sy, 0.3), opacity: 0, easing: "ease-out" },
              { transform: at(sx, sy), opacity: 0.42, offset: 0.16 },
              { transform: at(sx, sy), opacity: 0.42, offset: 0.36, easing: "cubic-bezier(0.55, 0, 0.45, 1)" },
              { transform: at(jx, jy, 0.4), opacity: 0, offset: 1 },
            ],
            { duration: 2500, delay: base + 250 + rand() * 900, fill: "both" },
          );
        } else {
          dot.classList.add("keep");
          const delay = base + 450 + ti * 150;
          const dur = 3000;
          const end = ends[ti];
          dot.animate(
            [
              { transform: at(sx, sy, 0.3), opacity: 0, easing: "ease-out" },
              { transform: at(sx, sy), opacity: 1, offset: 0.12 },
              { transform: at(sx, sy), opacity: 1, offset: 0.3, easing: "cubic-bezier(0.6, 0, 0.4, 1)" },
              { transform: at(jx, jy, 1.25), opacity: 1, offset: 0.6, easing: "cubic-bezier(0.6, 0, 0.3, 1)" },
              { transform: at(end.x, end.y), opacity: 1, offset: 0.95 },
              { transform: at(end.x, end.y), opacity: 0, offset: 1 },
            ],
            { duration: dur, delay, fill: "both" },
          );
          rows[ti].animate(
            [
              { opacity: 0, transform: "translateX(-16px)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 800, delay: delay + dur * 0.9, easing: EASE, fill: "backwards" },
          );
        }
      }
    },
  };

  // 5 · Connectors between the agents, drawn per build, with data moving along them.
  function buildArch() {
    const arch = $("#arch");
    const svg = $("#arch-links");
    if (!arch || !svg) return;
    svg.innerHTML = "";
    $$(".packet", arch).forEach((p) => p.remove());
    const node = (id) => $(`[data-id="${id}"]`, arch);
    const box = (n) => ({ l: n.offsetLeft, t: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight });
    const reasonCol = node("matcher");
    const xa = reasonCol.offsetLeft - 16;
    const xb = reasonCol.offsetLeft + reasonCol.offsetWidth + 16;
    const hot = ["profiler>store", "collectors>store", "store>matcher", "judge>week", "store>copilot"];
    arch.dataset.links.split(",").forEach((spec, n) => {
      const [pair, via] = spec.trim().split("@");
      const [from, to] = pair.split(">");
      const A = box(node(from));
      const B = box(node(to));
      let d;
      if (Math.abs(A.l - B.l) < 10) {
        const x = A.l + A.w / 2;
        d = `M ${x} ${A.t + A.h} L ${x} ${B.t}`;
      } else {
        const x1 = A.l + A.w;
        const y1 = A.t + A.h / 2;
        const x2 = B.l;
        const y2 = B.t + B.h / 2;
        if (via) {
          const [up, down] = via === "a" ? ["matcher", "judge"] : ["judge", "trend"];
          const U = box(node(up));
          const y = (U.t + U.h + box(node(down)).t) / 2;
          d = `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${xa - 34} ${y}, ${xa} ${y} L ${xb} ${y} C ${xb + 30} ${y}, ${x2 - 30} ${y2}, ${x2} ${y2}`;
        } else {
          const c = (x2 - x1) / 2;
          d = `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
        }
      }
      const st = +(node(to).dataset.step || 0);
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("data-a", "none");
      p.setAttribute("data-draw", "");
      p.dataset.d = st ? "120" : "900";
      if (st) p.dataset.step = String(st);
      if (hot.includes(pair)) p.classList.add("hot");
      svg.appendChild(p);
      if (hot.includes(pair)) {
        const k = document.createElement("span");
        k.className = "packet";
        k.style.offsetPath = `path("${d}")`;
        k.style.animationDelay = `${-(n * 0.73) % 3.2}s`;
        k.setAttribute("data-a", "fade");
        k.dataset.d = st ? "900" : "1600";
        if (st) k.dataset.step = String(st);
        arch.appendChild(k);
      }
    });
  }

  // 6 · The highlighter runs over the quote that backs the claim.
  hooks["s-profile"] = {
    enter(slide, { built, base }) {
      const m = $("#mark-1", slide);
      if (!m || reduce) return;
      m.animate([{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }], {
        duration: built ? 1 : 1300,
        delay: built ? 0 : base + 1300,
        easing: EASE_IO,
        fill: "backwards",
      });
    },
  };

  // 7 · Both top fives fly out of the shared pool.
  hooks["s-week"] = {
    step(slide, k) {
      if (k !== 1 || reduce) return;
      const pill = $("#pool-pill", slide).getBoundingClientRect();
      const px = pill.left + pill.width / 2;
      const py = pill.top + pill.height / 2;
      $$(".cmp-col h4, .cmp-col h4 + p", slide).forEach((el, i) =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 200 + i * 40, easing: EASE, fill: "backwards" }),
      );
      $$(".cmp-row", slide).forEach((r, i) => {
        const rr = r.getBoundingClientRect();
        const dx = (px - (rr.left + rr.width / 2)) / scale;
        const dy = (py - (rr.top + rr.height / 2)) / scale;
        const col = i < 5 ? 0 : 1;
        r.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0 },
            { opacity: 1, offset: 0.35 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 1150, delay: 280 + (i % 5) * 95 + col * 50, easing: EASE, fill: "backwards" },
        );
      });
    },
  };

  // 9 · The assistant "types" before each answer appears.
  function typeIn(msg, delay) {
    const typing = $(".typing", msg);
    const content = $(".content", msg);
    if (!typing || !content || reduce) return;
    typing.animate(
      [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }],
      { duration: 1100, delay, fill: "none" },
    );
    content.animate(
      [
        { opacity: 0, filter: "blur(4px)" },
        { opacity: 1, filter: "blur(0px)" },
      ],
      { duration: 700, delay: delay + 950, easing: EASE, fill: "backwards" },
    );
  }
  hooks["s-bounds"] = {
    enter(slide, { built, base }) {
      if (built) return;
      const first = $(".msg.bot", slide);
      typeIn(first, base + 650);
    },
    step(slide, k) {
      $$(`.msg.bot[data-step="${k}"]`, slide).forEach((m) => typeIn(m, 450));
    },
  };

  // 15 · The built and reused pieces settle in one after another.
  hooks["s-built"] = {
    enter(slide, { built, base }) {
      if (reduce) return;
      $$(".pill", slide).forEach((p, i) =>
        p.animate(
          [
            { opacity: 0, transform: "translateY(14px) scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 700, delay: (built ? 0 : base + 380) + i * 32, easing: EASE, fill: "backwards" },
        ),
      );
    },
  };

  /* ---------------------------------------------------------------- */
  /* Notes, clock, presenter window, overview                          */
  /* ---------------------------------------------------------------- */

  const notesEl = $("#notes");
  let presenter = null;

  function startClock() {
    if (started == null) started = Date.now();
  }
  function clockText() {
    if (started == null) return "00:00";
    const s = Math.floor((Date.now() - started) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  function plannedUntil(i) {
    let t = 0;
    for (let k = 0; k <= i; k++) t += +($(".notes", slides[k])?.dataset.time || 0);
    return t;
  }
  function fmtSec(t) {
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  }

  function syncNotes() {
    if (index < 0) return;
    const s = slides[index];
    const a = $(".notes", s);
    const steps = stepsOf(s);
    $("#n-slide").textContent = `${index + 1} / ${N} · ${s.dataset.title || ""}${steps ? ` · build ${step} of ${steps}` : ""}`;
    $("#n-time").textContent = a?.dataset.time ? `about ${a.dataset.time} s · plan ${fmtSec(plannedUntil(index))} by the end of this slide` : "";
    $("#n-next").textContent = index < N - 1 ? `Next: ${slides[index + 1].dataset.title}` : "Last slide";
    $("#n-body").innerHTML = a ? a.innerHTML : "";
    $("#n-clock").textContent = clockText();
    updatePresenter();
  }

  function toggleNotes(force) {
    notesEl.classList.toggle("on", force);
    syncNotes();
  }

  const PRESENTER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Presenter · Virtual Science Park</title>
<style>
  body{margin:0;background:#0d0d10;color:#f4f4f6;font:16px/1.5 "Geist",system-ui,-apple-system,"Segoe UI",sans-serif;display:grid;grid-template-rows:auto 1fr auto;height:100vh}
  header{display:flex;gap:28px;align-items:baseline;padding:18px 28px;border-bottom:1px solid #ffffff18}
  #clock{font:600 44px/1 ui-monospace,Consolas,monospace;letter-spacing:-.02em}
  #plan{color:#ffffff80;font:14px ui-monospace,Consolas,monospace}
  #pos{margin-left:auto;color:#7fd3f0;font:14px ui-monospace,Consolas,monospace}
  main{padding:24px 28px;overflow:auto}
  h1{margin:0 0 6px;font-size:28px;font-weight:500;letter-spacing:-.02em}
  #build{color:#ffffff80;font:13px ui-monospace,Consolas,monospace;margin-bottom:16px}
  #body{font-size:23px;line-height:1.55;max-width:1000px}
  #body p{margin:0 0 14px}
  footer{display:flex;gap:12px;align-items:center;padding:14px 28px;border-top:1px solid #ffffff18;color:#ffffff90}
  button{font:inherit;color:#f4f4f6;background:#ffffff12;border:1px solid #ffffff24;border-radius:999px;padding:8px 18px;cursor:pointer}
  button:hover{background:#ffffff20}
  #next{margin-left:auto}
</style></head><body>
<header><span id="clock">00:00</span><span id="plan"></span><span id="pos"></span></header>
<main><h1 id="title"></h1><div id="build"></div><div id="body"></div></main>
<footer><button id="b-prev">Back</button><button id="b-next">Next</button><button id="b-reset">Reset clock</button><span id="next"></span></footer>
</body></html>`;

  function openPresenter() {
    if (presenter && !presenter.closed) {
      presenter.focus();
      return;
    }
    presenter = window.open("", "vsp-presenter", "width=1180,height=760");
    if (!presenter) {
      toggleNotes(true);
      return;
    }
    const d = presenter.document;
    d.open();
    d.write(PRESENTER_HTML);
    d.close();
    d.addEventListener("keydown", onKey);
    d.getElementById("b-prev").onclick = prev;
    d.getElementById("b-next").onclick = next;
    d.getElementById("b-reset").onclick = resetClock;
    startClock();
    updatePresenter();
  }

  function updatePresenter() {
    if (!presenter || presenter.closed || index < 0) return;
    const d = presenter.document;
    const s = slides[index];
    const a = $(".notes", s);
    const steps = stepsOf(s);
    d.getElementById("clock").textContent = clockText();
    d.getElementById("plan").textContent = `plan ${fmtSec(plannedUntil(index))} by the end of this slide · about ${a?.dataset.time || "?"} s here`;
    d.getElementById("pos").textContent = `${index + 1} / ${N}`;
    d.getElementById("title").textContent = s.dataset.title || "";
    d.getElementById("build").textContent = steps ? `Build ${step} of ${steps}: press Next to reveal` : "";
    d.getElementById("body").innerHTML = a ? a.innerHTML : "";
    d.getElementById("next").textContent = index < N - 1 ? `Next: ${slides[index + 1].dataset.title}` : "Last slide";
  }

  function resetClock() {
    started = Date.now();
    syncNotes();
  }

  setInterval(() => {
    if (notesEl.classList.contains("on")) $("#n-clock").textContent = clockText();
    if (presenter && !presenter.closed) presenter.document.getElementById("clock").textContent = clockText();
  }, 500);

  const overview = $("#overview");
  function buildOverview() {
    const grid = $("#ov-grid");
    grid.innerHTML = "";
    slides.forEach((s, i) => {
      const b = document.createElement("button");
      b.className = "ov-item";
      b.innerHTML = `<small>${String(i + 1).padStart(2, "0")}${s.dataset.section ? ` · ${s.dataset.section}` : ""}</small><span></span>`;
      b.querySelector("span").textContent = s.dataset.title || "";
      b.onclick = (e) => {
        e.stopPropagation();
        toggleOverview(false);
        show(i, { dir: i > index ? 1 : -1 });
      };
      grid.appendChild(b);
    });
  }
  function toggleOverview(force) {
    const on = overview.classList.toggle("on", force);
    if (on) {
      $$(".ov-item", overview).forEach((b, i) => b.classList.toggle("now", i === index));
      $$(".ov-item", overview)[index]?.focus();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Input                                                             */
  /* ---------------------------------------------------------------- */

  const hint = $("#hint");
  const jump = $("#jump");
  let jumpBuf = "";
  let black = null;

  function hideHint() {
    hint.classList.add("off");
  }

  function toggleBlack() {
    if (black) {
      black.remove();
      black = null;
      return;
    }
    black = document.createElement("div");
    Object.assign(black.style, { position: "fixed", inset: "0", background: "#000", zIndex: "60" });
    document.body.appendChild(black);
  }

  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    hideHint();
    if (overview.classList.contains("on")) {
      if (k === "Escape" || k === "o" || k === "O") toggleOverview(false);
      return;
    }
    if (/^[0-9]$/.test(k)) {
      jumpBuf = (jumpBuf + k).slice(-2);
      jump.textContent = `Go to slide ${jumpBuf} · Enter`;
      jump.classList.add("on");
      return;
    }
    if (jumpBuf && (k === "Enter" || k === "Escape")) {
      e.preventDefault();
      const n = +jumpBuf - 1;
      jumpBuf = "";
      jump.classList.remove("on");
      if (k === "Enter" && n >= 0 && n < N) show(n, { dir: n > index ? 1 : -1 });
      return;
    }
    switch (k) {
      case "ArrowRight":
      case "ArrowDown":
      case "PageDown":
      case " ":
      case "Enter":
        e.preventDefault();
        if (black) toggleBlack();
        else next();
        break;
      case "ArrowLeft":
      case "ArrowUp":
      case "PageUp":
      case "Backspace":
        e.preventDefault();
        if (black) toggleBlack();
        else prev();
        break;
      case "Home":
        show(0, { dir: -1 });
        break;
      case "End":
        show(N - 1, { dir: 1, built: true });
        break;
      case "f":
      case "F":
        toggleFull();
        break;
      case "n":
      case "N":
        toggleNotes();
        break;
      case "p":
      case "P":
        openPresenter();
        break;
      case "o":
      case "O":
      case "Escape":
        if (k !== "Escape") toggleOverview(true);
        break;
      case "b":
      case "B":
      case ".":
        toggleBlack();
        break;
      case "t":
      case "T":
        resetClock();
        break;
      default:
        break;
    }
  }

  document.addEventListener("keydown", onKey);
  stage.addEventListener("click", (e) => {
    hideHint();
    if (e.target.closest("a, button")) return;
    if (performance.now() - lastNav < 350) return;
    lastNav = performance.now();
    const r = stage.getBoundingClientRect();
    if (e.clientX < r.left + r.width * 0.2) prev();
    else next();
  });
  let touchX = null;
  addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) {
      e.preventDefault?.();
      if (dx < 0) next();
      else prev();
    }
  });
  let idle;
  addEventListener("mousemove", () => {
    document.body.classList.remove("hide-cursor");
    clearTimeout(idle);
    idle = setTimeout(() => document.body.classList.add("hide-cursor"), 2200);
  });
  addEventListener("resize", fit);
  addEventListener("beforeunload", () => presenter && !presenter.closed && presenter.close());

  /* ---------------------------------------------------------------- */
  /* Start                                                             */
  /* ---------------------------------------------------------------- */

  applyConfig();
  $$("[data-split]", stage).forEach(split);
  progress.innerHTML = slides.map(() => "<i><b></b></i>").join("");
  $("#total").textContent = String(N).padStart(2, "0");
  buildOverview();
  fit();

  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    buildArch();
    slides.forEach((s) => (s._steps = null));
    const fromHash = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(fromHash) ? fromHash - 1 : 0, { dir: 1 });
    setTimeout(hideHint, 7000);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(boot);
    setTimeout(boot, 1500);
  } else {
    boot();
  }

  // For the presenter window and for debugging in the console.
  window.deck = { next, prev, show, get index() { return index; }, get step() { return step; } };
})();
