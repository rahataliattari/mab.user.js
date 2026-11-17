// ==UserScript==
// @name Ur Eng - Auto Print & Return to Box Open v10.50
// @namespace mab.dibaadm.v10
// @version 10.50
// @match *://*.dibaadm.com/*
// @grant none
// @run-at document-idle
// ==/UserScript==

(function () {
  // =============================================================
  // سیٹنگز (CFG) — v10.48
  // cardOnFirstPage  : true  = Cross Check کارڈ کولیکشن کے پہلے صفحے (Box Open فارم) پر ہی کھلے گا
  // cardOnConfirmPage: false = دوسرے (Confirmation) صفحے پر کارڈ دوبارہ نہیں کھلے گا
  // autoProcess      : false = کارڈ دیکھ کر آپ کارڈ کے "Process" بٹن سے آگے بڑھیں گے؛ true = پرانی طرح خود بخود Process
  // =============================================================
  const CFG = {
    cardOnFirstPage: false, // v10.46: سب کچھ Box Code پینل میں ہے، الگ کارڈ نہیں کھلتا؛ پینل کا آخری بٹن سیدھا Process کرتا ہے
    cardOnConfirmPage: false,
    autoProcess: false,
  };

  const FIXED = [
    ["Slip Type", "E-Slip"],
    ["Receipt Type", "E-Slip"],
    ["Donation Type", "Donation Box Nafila"],
    ["Donation Subtype", "Sadqah"],
    ["Donation Purpose", "All Purpose"],
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // اردو حروف کی یکسانیت (ی/ي، ک/ك، ہ/ه، اعراب وغیرہ) تاکہ اردو متن درست میچ ہو
  const norm = (s) =>
    String(s == null ? "" : s)
      .replace(/[\u064B-\u065F\u0670\u0640\u200c\u200d\u200e\u200f]/g, "")
      .replace(/[كڪ]/g, "ک")
      .replace(/[يىې]/g, "ی")
      .replace(/[هۀۃ]/g, "ہ")
      .replace(/ۓ/g, "ے")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const FLOW_FLAG = "eslip_auto_return_flow";

  // =============================================================
  // انگلش + اردو صفحے کے الفاظ (اردو الفاظ صرف وہی جو اردو صفحے کی تصویر میں نظر آئے)
  // =============================================================
  const LABEL_ALIASES = {
    "box code": ["Box Code", "بکس کوڈ"],
    "donation type": ["Donation Type", "عطیہ کی قسم"],
    "donation subtype": ["Donation Subtype", "عطیات کی ذیلی اقسام"],
    "donation purpose": ["Donation Purpose", "عطیات کی مد"],
    amount: ["Amount", "رقم"],
    "shop name": ["Shop Name", "دکان کا نام"],
    "shop owner name": ["Shop Owner Name", "دکاندار کا نام"],
    "mobile number": ["Mobile Number", "موبائل نمبر"],
    "shop address": ["Shop Address", "دکان کا پتہ"],
    "near by": ["Near By", "قریبی جگہ"],
    "donor department": ["Donor Department", "ڈونر ڈیپارٹمنٹ"],
    "box open date": ["Box Open Date"],
    // Slip Type, Google Location, Shop Location Type اردو صفحے پر بھی انگلش میں ہیں
  };
  const aliasesFor = (name) => LABEL_ALIASES[norm(name)] || [name];
  const anyIn = (txt, list) => {
    const t = norm(txt);
    return list.some((x) => t.includes(norm(x)));
  };
  const PRINT_WORDS = ["print", "پرنٹ"]; // اردو Print صفحے کا بٹن "پرنٹ"
  const PROCESS_WORDS = ["process", "محفوظ کریں"]; // اردو صفحے کا آخری بٹن "محفوظ کریں"
  const HEAD_OK = ["box open", "بکس کے عطیات"].map(norm); // اردو صفحے کا عنوان "بکس کے عطیات"

  // آپشن نہ ملنے پر کنسول (F12) میں اصل آپشنز چھاپ دیں
  const logOptions = (name) => {
    try {
      const el = find(name);
      if (el && el.tagName === "SELECT")
        console.warn(
          '[MAB] "' + name + '" کے آپشنز:',
          [...el.options].map((o) => o.text.trim())
        );
      else console.warn('[MAB] "' + name + '" کا خانہ نہیں ملا');
    } catch (e) {}
  };

  // =============================================================
  // SECTION 1: E-Slip Print اور Dashboard آٹو نیویگیشن
  // =============================================================

  // --- A. Dashboard پر پہنچ کر Collection -> Box Open کھولنا ---
  if (location.pathname.startsWith("/dashboard")) {
    if (sessionStorage.getItem(FLOW_FLAG)) {
      sessionStorage.removeItem(FLOW_FLAG);

      (async () => {
        // اسکرین پر گائیڈ میسیج
        const info = document.createElement("div");
        info.style.cssText =
          "position:fixed;top:15px;left:50%;transform:translateX(-50%);background:#1b5e20;color:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:bold;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,0.4);";
        info.textContent = "🔄 Box Open پیج کھولا جا رہا ہے...";
        document.body.appendChild(info);

        const findMenuEl = (text) => {
          const want = norm(text);
          const all = [...document.querySelectorAll("a, p, span, li")];
          return all.find((e) => {
            const t = norm(e.innerText || e.textContent);
            return (
              t === want ||
              t.startsWith(want) ||
              (e.tagName === "A" && t.includes(want))
            );
          });
        };

        // 1. اگر مینو بند ہو تو ٹوگل بٹن دبا کر سائیڈ بار کھولیں
        let collBtn = findMenuEl("Collection");
        if (!collBtn) {
          const toggle = document.querySelector(
            '[data-widget="pushmenu"], .sidebar-toggle, .navbar-toggler, .menu-toggle, .fa-bars'
          );
          if (toggle) {
            toggle.click();
            await sleep(500);
          }
          collBtn = findMenuEl("Collection");
        }

        // 2. Collection پر کلک
        if (collBtn) {
          (collBtn.closest("a") || collBtn).click();
          await sleep(600);
        }

        // 3. Box Open پر کلک
        let boxOpenBtn = findMenuEl("Box Open");
        for (let i = 0; i < 15 && !boxOpenBtn; i++) {
          await sleep(250);
          boxOpenBtn = findMenuEl("Box Open");
        }

        if (boxOpenBtn) {
          const link = boxOpenBtn.closest("a") || boxOpenBtn;
          link.click();
          // بیک اپ: اگر کلک نہ ہو تو ڈائریکٹ href پر جائیں
          if (
            link.href &&
            link.href !== "#" &&
            !link.href.startsWith("javascript:")
          ) {
            setTimeout(() => {
              location.href = link.href;
            }, 800);
          }
        } else {
          // مینو نہ ملے (مثلاً اردو مینو) تو فارم کے پتے پر سیدھا جائیں (دونوں صفحوں کا پتہ /collection-form ہے)
          location.href = location.origin + "/collection-form";
        }
      })();
    }
    return;
  }

  // --- B. E-Slip Page پر آٹو پرنٹ اور فوری واپسی ---
  if (location.pathname.includes("/eslip-print")) {
    let moved = false;
    function goDashboard() {
      if (moved) return;
      moved = true;
      sessionStorage.setItem(FLOW_FLAG, "1");
      location.href = `${location.origin}/dashboard`;
    }

    // پرنٹ بٹن دبا کر واپسی کا ٹائمر شروع کرنا
    (async () => {
      let printBtn = null;
      for (let i = 0; i < 40 && !printBtn; i++) {
        printBtn = [
          ...document.querySelectorAll("button, a, input[type=button]"),
        ].find((e) => anyIn(e.textContent || e.value, PRINT_WORDS));
        if (!printBtn) await sleep(250);
      }

      if (printBtn) {
        await sleep(400);
        printBtn.click(); // سسٹم پرنٹ ڈائیلاگ کھولیں
      }

      // اوپر فلوٹنگ بار دکھائیں
      let timeLeft = 10;
      const bar = document.createElement("div");
      bar.id = "mab-return-banner";
      bar.style.cssText =
        "position:fixed;top:10px;left:5%;width:90%;background:#1b5e20;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.5);z-index:2147483647;display:flex;justify-content:space-between;align-items:center;font-family:sans-serif;font-size:13px;";
      bar.innerHTML = ` <span>🖨️ پرنٹ بھیج دیا گیا (<b id="mab-secs">10</b>s میں واپسی)</span> <button id="mab-now-btn" style="background:#fff;color:#1b5e20;border:0;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;">🚀 فوری Box Open جائیں</button> `;
      document.body.appendChild(bar);

      document
        .getElementById("mab-now-btn")
        .addEventListener("click", goDashboard);

      // ٹچ بیک اپ: اسکرین پر کہیں بھی ٹچ کریں تو فوراً واپس چلا جائے
      window.addEventListener(
        "touchstart",
        () => setTimeout(goDashboard, 300),
        { once: true }
      );
      window.addEventListener("click", () => setTimeout(goDashboard, 300), {
        once: true,
      });

      // ٹائمر الٹی گنتی (10 سیکنڈ بعد خودکار واپسی)
      const timer = setInterval(() => {
        timeLeft--;
        const el = document.getElementById("mab-secs");
        if (el) el.textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(timer);
          goDashboard();
        }
      }, 1000);
    })();

    return;
  }

  // =============================================================
  // SECTION 2: Form آٹو فلنگ لاجک (Box Open Form)
  // =============================================================
  function labelOf(el) {
    if (el.id) {
      const l = document.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent;
    }
    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      let p = n.previousElementSibling;
      while (p) {
        if (p.textContent.trim() && !p.querySelector("input,select"))
          return p.textContent;
        p = p.previousElementSibling;
      }
      n = n.parentElement;
    }
    return el.placeholder || el.name || "";
  }

  function find(name) {
    const key = norm(name);
    const als = aliasesFor(name).map(norm);
    return [...document.querySelectorAll("input,select,textarea")]
      .filter((e) => !["hidden", "button", "submit"].includes(e.type))
      .find((e) => {
        const l = norm(labelOf(e)).replace(/[*:]/g, "").trim();
        return (
          als.some((a) => l.startsWith(a)) ||
          (key.includes("slip") && l.includes("slip")) ||
          (key.includes("receipt") && l.includes("slip"))
        );
      });
  }

  function afterLabel(text, selector) {
    const als = aliasesFor(text).map(norm);
    const lbl = [
      ...document.querySelectorAll("label,span,div,p,b,strong"),
    ].find(
      (e) =>
        e.children.length <= 1 &&
        als.includes(norm(e.textContent).replace(/[*:]/g, "").trim())
    );
    if (!lbl) return null;
    return [...document.querySelectorAll(selector)].find(
      (e) => lbl.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }

  function fire(el) {
    ["input", "change", "blur"].forEach((t) =>
      el.dispatchEvent(new Event(t, { bubbles: true }))
    );
    if (window.jQuery) {
      try {
        window.jQuery(el).trigger("change");
      } catch (e) {}
    }
  }

  let lastBoxMiss = ""; // "notfound" = سسٹم پر کوڈ نہیں؛ "timeout" = جواب نہیں آیا
  async function setBoxCode(code) {
    lastBoxMiss = "";
    const $ = window.jQuery;
    const sel = afterLabel("Box Code", "select");
    let opened = false;
    if (sel && $ && $.fn && $.fn.select2) {
      try {
        $(sel).select2("open");
        opened = true;
      } catch (e) {}
    }
    if (!opened) {
      const c = afterLabel("Box Code", ".select2-selection");
      if (!c) return false;
      c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    }
    let sf = null;
    for (let i = 0; i < 250 && !sf; i++) {
      sf = document.querySelector(".select2-search__field");
      if (!sf) await sleep(20);
    }
    if (!sf) return false;
    sf.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(sf, code);
    ["input", "keyup"].forEach((t) =>
      sf.dispatchEvent(new Event(t, { bubbles: true }))
    );
    const tTyped = Date.now(),
      nc = norm(code);
    let sawSearching = false;
    for (let i = 0; i < 600; i++) {
      // select2 کا پیغام: Searching… (تلاش جاری) یا No results found (سسٹم پر کوڈ نہیں)
      const msgs = [
        ...document.querySelectorAll(
          ".select2-results__message, .select2-results__option.loading-results"
        ),
      ];
      if (
        msgs.some(
          (m) =>
            /searching/i.test(m.textContent) ||
            m.classList.contains("loading-results")
        )
      )
        sawSearching = true;
      else if (
        msgs.some((m) => /no results|not found|no match/i.test(m.textContent)) &&
        (sawSearching || Date.now() - tTyped > 900)
      ) {
        lastBoxMiss = "notfound";
        try {
          if (sel && $ && $.fn && $.fn.select2) $(sel).select2("close");
        } catch (e) {}
        return false;
      }
      // نتیجہ آتے ہی فوراً (ہر 30ms پر چیک، زیادہ سے زیادہ ~18s)
      const opts = [
        ...document.querySelectorAll(".select2-results__option"),
      ].filter(
        (x) =>
          !x.classList.contains("loading-results") &&
          !x.classList.contains("select2-results__message") &&
          x.textContent.trim() &&
          !/searching|please enter|no results/i.test(x.textContent)
      );
      const o =
        opts.find((x) => norm(x.textContent).includes(nc)) ||
        (Date.now() - tTyped > 1200 ? opts[0] : null);
      if (o) {
        ["mousedown", "mouseup", "click"].forEach((t) =>
          o.dispatchEvent(new MouseEvent(t, { bubbles: true }))
        );
        return true;
      }
      await sleep(30);
    }
    lastBoxMiss = "timeout";
    return false;
  }

  // ---------- تیز سیٹنگ: بغیر ٹھہراؤ کے؛ True = اس وقت منتخب ہے ----------
  function fastSet(name, text) {
    const want = norm(text);
    const radios = [
      ...document.querySelectorAll(
        'input[type="radio"], input[type="checkbox"]'
      ),
    ];
    const r = radios.find(
      (el) => norm(labelOf(el)).includes(want) || norm(el.value).includes(want)
    );
    if (r) {
      if (!r.checked) {
        r.click();
        fire(r);
        return false;
      }
      return true;
    }
    const el = find(name);
    if (!el || el.tagName !== "SELECT") return false;
    const cur =
      el.selectedIndex >= 0 &&
      el.value !== "" &&
      norm(el.options[el.selectedIndex].text).includes(want);
    if (cur) return true;
    const opt = [...el.options].find(
      (o) => o.value !== "" && norm(o.text).includes(want)
    );
    if (!opt) return false; // آپشن ابھی سسٹم سے نہیں آیا
    el.selectedIndex = opt.index;
    fire(el);
    return false; // اگلی چیک پر تصدیق ہوگی
  }

  const FILL_NAMES = [
    "Shop Name",
    "Shop Owner Name",
    "Mobile Number",
    "Shop Address",
    "Near By",
    "Donor Department",
    "Shop Location Type",
  ];
  const isFilledEl = (el) =>
    el.tagName === "SELECT"
      ? el.selectedIndex >= 0 && el.value !== ""
      : String(el.value || "").trim() !== "";

  const todayStr = () => {
    const d = new Date(),
      p = (n) => String(n).padStart(2, "0");
    return p(d.getDate()) + " " + p(d.getMonth() + 1) + " " + d.getFullYear();
  };
  let lastDateFix = 0;
  function ensureDate() {
    const DRE = /^\d{2}\s\d{2}\s\d{4}$/;
    const el =
      find("Box Open Date") ||
      [...document.querySelectorAll("input")].find(
        (i) => i.type !== "hidden" && DRE.test((i.value || "").trim())
      );
    if (!el || el.tagName === "SELECT") return;
    const v = (el.value || "").trim(),
      today = todayStr();
    if (v === today) return;
    if (v !== "" && !DRE.test(v)) return; // دوسرے فارمیٹ کو نہیں چھیڑتے
    if (Date.now() - lastDateFix < 1000) return;
    lastDateFix = Date.now();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set.call(el, today);
    fire(el);
  }

  // Fill دباتے ہی (ڈائیلاگ کھلتے ہی): سسٹم سے آزاد خانے
  async function presetTask() {
    const t0 = Date.now();
    ensureDate();
    while (Date.now() - t0 < 10000) {
      const a = fastSet("Slip Type", "E-Slip");
      const b = fastSet("Donation Type", "Donation Box Nafila");
      const c = fastSet("Donation Purpose", "All Purpose");
      if (a && b && c) return true;
      await sleep(40);
    }
    return false;
  }

  // ایک نظر میں پورا فارم: خالی ہو تو خود ٹھیک کرتا ہے؛ سب ٹھیک ہو تو [] لوٹاتا ہے
  async function waitReady(maxMs, ctx) {
    const t0 = Date.now();
    while (true) {
      const miss = [];
      ensureDate();
      if (!fastSet("Slip Type", "E-Slip")) miss.push("Slip Type");
      if (!fastSet("Donation Type", "Donation Box Nafila"))
        miss.push("Donation Type");
      if (!fastSet("Donation Subtype", "Sadqah")) miss.push("Donation Subtype");
      if (!fastSet("Donation Purpose", "All Purpose"))
        miss.push("Donation Purpose");
      const bsel = afterLabel("Box Code", "select");
      if (bsel && bsel.tagName === "SELECT" && bsel.value === "")
        miss.push("Box Code");
      let found = 0;
      FILL_NAMES.forEach((n) => {
        const el = find(n);
        if (!el) return; // خانہ نہ ملے تو بلاک نہیں کرتے
        found++;
        let ok = isFilledEl(el);
        if (
          ok &&
          n === "Shop Name" &&
          ctx &&
          ctx.stale &&
          String(el.value).trim() === ctx.stale &&
          Date.now() - ctx.tSel < 2000
        )
          ok = false; // پچھلی دکان کا پرانا ڈیٹا
        if (!ok) miss.push(n);
      });
      if (!found) miss.push("Shop Name");
      const li = getLocInput();
      if (li && !String(li.value || "").trim()) miss.push("Google Location");
      if (!miss.length) return [];
      if (Date.now() - t0 > maxMs) return miss;
      if (ctx && ctx.loc) ctx.loc.tick();
      await sleep(40);
    }
  }

  function doClick(el) {
    if (!el) return;
    try {
      el.focus();
    } catch (e) {}
    try {
      el.click();
    } catch (e) {}
    ["mousedown", "mouseup", "click"].forEach((t) => {
      try {
        el.dispatchEvent(
          new MouseEvent(t, { bubbles: true, cancelable: true, view: window })
        );
      } catch (e) {}
    });
    if (window.jQuery) {
      try {
        window.jQuery(el).trigger("click");
      } catch (e) {}
    }
  }

  function getLocInput() {
    return (
      find("Google Location") ||
      afterLabel("Google Location", "input") ||
      [...document.querySelectorAll("input")].find((i) =>
        /location/i.test(i.name || i.id || i.placeholder || "")
      )
    );
  }

  // لوکیشن: تیر پر کلک، Pick Location ظاہر ہوتے ہی ایک کلک؛ کوڈ سے ساتھ ساتھ چلتا ہے
  function makeLocTask() {
    const st = { started: false, running: false, clickedAt: 0, tries: 0 };
    const go = async () => {
      st.running = true;
      try {
        const locInput = getLocInput();
        if (!locInput) return;
        const container =
          locInput.closest(".form-group, .input-group, div, tr, td") ||
          locInput.parentElement;
        const candidates = [
          ...container.querySelectorAll("a, button, i, span, svg"),
        ].filter(
          (el) =>
            el !== locInput &&
            !el.contains(locInput) &&
            locInput.compareDocumentPosition(el) &
              Node.DOCUMENT_POSITION_FOLLOWING
        );
        let arrowIcon = candidates.find((el) =>
          /arrow|plane|send|nav|location|compass|gps/i.test(
            (el.className || "").toString()
          )
        );
        if (!arrowIcon && candidates.length > 0) arrowIcon = candidates[0];
        if (arrowIcon) doClick(arrowIcon);
        for (let i = 0; i < 500; i++) {
          // ہر 30ms پر، ~15s تک
          const pickBtn = [
            ...document.querySelectorAll(
              'button, a, input[type="button"], input[type="submit"]'
            ),
          ].find((el) => {
            const txt = norm(el.innerText || el.textContent || el.value || "");
            return (
              (el.offsetWidth > 0 || el.offsetHeight > 0) &&
              txt.includes("pick location")
            );
          });
          if (pickBtn) {
            try {
              pickBtn.focus();
            } catch (e) {}
            pickBtn.click();
            st.clickedAt = Date.now();
            return;
          }
          await sleep(30);
        }
      } finally {
        st.running = false;
      }
    };
    st.tick = () => {
      if (st.running) return;
      const li = getLocInput();
      if (!li || String(li.value || "").trim()) return;
      if (!st.started) {
        st.started = true;
        st.tries = 1;
        go();
        return;
      }
      if (st.clickedAt && Date.now() - st.clickedAt > 4000 && st.tries < 3) {
        st.tries++;
        go();
      } // بھرا نہ ہو تو دوبارہ
    };
    return st;
  }

  // صفحے کا اصل Process / محفوظ کریں بٹن (ہمارے اپنے کارڈ/ڈائیلاگ/کیلکولیٹر کے بٹن شامل نہیں)
  async function clickProcessButton() {
    for (let i = 0; i < 300; i++) {
      const btns = [
        ...document.querySelectorAll(
          'button, input[type="button"], input[type="submit"], a'
        ),
      ];
      const procBtn = btns.find((b) => {
        if (b.closest("#mab-view-card, #mab-dlg-overlay, #mab-calc-root"))
          return false;
        const txt = norm(b.innerText || b.textContent || b.value || "");
        return (
          (b.offsetWidth > 0 || b.offsetHeight > 0) && anyIn(txt, PROCESS_WORDS)
        );
      });
      if (procBtn) {
        try {
          procBtn.focus();
        } catch (e) {}
        procBtn.click(); // صرف ایک کلک
        return true;
      }
      await sleep(30);
    }
    return false;
  }

  function readFromCollectionForm(aliases) {
    const names = [];
    aliases.forEach((a) =>
      aliasesFor(a).forEach((x) => {
        if (!names.includes(x)) names.push(x);
      })
    );
    for (const name of names) {
      const el = find(name);
      if (el) {
        if (el.tagName === "SELECT" && el.selectedIndex >= 0) {
          const t = el.options[el.selectedIndex].text.trim();
          if (t && !/select/i.test(t)) return t;
        }
        if (el.value && el.value.trim()) return el.value.trim();
      }

      const lbl = [
        ...document.querySelectorAll("label, span, strong, b, dt"),
      ].find(
        (e) => norm(e.textContent).replace(/[:*#]/g, "").trim() === norm(name)
      );
      if (lbl) {
        let sib = lbl.nextElementSibling;
        if (sib && sib.textContent.trim()) {
          const inp = sib.querySelector("input, select, textarea");
          if (inp && inp.value) return inp.value.trim();
          return sib.textContent.trim();
        }
        const parent = lbl.parentElement;
        if (parent) {
          const valEl = parent.querySelector(
            "input, select, textarea, p, span.form-control-static"
          );
          if (valEl && valEl !== lbl) {
            return (valEl.value || valEl.textContent || "").trim();
          }
        }
      }
    }
    return "";
  }

  // =============================================================
  // پروفیشنل ان پٹ ڈائیلاگ (Box Code اور رقم)
  // =============================================================
  function injectDialogStyle() {
    if (document.getElementById("mab-dlg-style")) return;
    const st = document.createElement("style");
    st.id = "mab-dlg-style";
    st.textContent = ` #mab-dlg-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:2147483647; display:flex; align-items:flex-start; justify-content:center; padding:24px 12px 0; font-family:Roboto,"Segoe UI",Tahoma,sans-serif; } #mab-dlg-overlay * { box-sizing:border-box; } .mab-dlg { width:100%; max-width:430px; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 14px 40px rgba(0,0,0,0.5); border:1px solid #2f6b1f; } .mab-dlg-head { background:linear-gradient(135deg,#0d4a12 0%,#2f6b1f 55%,#5b8c3a 100%); color:#fff; padding:10px 14px; font-weight:800; font-size:15px; display:flex; align-items:center; gap:8px; } .mab-snd + .mab-snd { margin-inline-start:8px; } .mab-snd { margin-inline-start:auto; background:rgba(0,0,0,0.25); border:0; color:#fff; width:34px; height:34px; border-radius:9px; font-size:16px; cursor:pointer; line-height:1; } .mab-grp { background:#fff; border:1px solid #dbe6d6; border-radius:12px; padding:9px 10px; margin-bottom:9px; } .mab-grp-title { font-size:12px; font-weight:800; color:#2f6b1f; margin-bottom:6px; } .mab-old { display:flex; gap:8px; align-items:center; background:#eef2ec; border-radius:8px; padding:6px 9px; margin-bottom:6px; font-size:13.5px; font-weight:700; color:#44533f; } .mab-old > span { font-size:10px; font-weight:800; color:#fff; background:#7b8c76; border-radius:5px; padding:2px 6px; flex-shrink:0; } .mab-old > div { min-width:0; word-break:break-word; } .mab-new { width:100%; font-size:16px; font-weight:700; padding:9px 10px; border:2px solid #b9cdb3; border-radius:10px; outline:none; background:#fff; color:#0d4a12; font-family:inherit; } .mab-new:focus { border-color:#2e7d32; } .mab-new.bad { border-color:#d32f2f; } .mab-fhint { font-size:11.5px; font-weight:700; min-height:0; margin-top:3px; color:#6b7f66; } .mab-fhint.bad { color:#c62828; } .mab-fhint.ok { color:#2e7d32; } .mab-mini { background:#e9eee7; border:0; border-radius:8px; padding:6px 12px; font-size:12px; font-weight:800; color:#44533f; cursor:pointer; font-family:inherit; } .mab-dlg-body { padding:14px; background:#f6f9f4; } .mab-dlg-label { font-size:12px; font-weight:700; color:#4a5e45; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; } .mab-dlg-input { width:100%; font-size:26px; font-weight:800; padding:10px 12px; border:2px solid #b9cdb3; border-radius:12px; outline:none; background:#fff; color:#0d4a12; transition:border-color .15s, box-shadow .15s; } .mab-dlg-input.ok { border-color:#2e7d32; box-shadow:0 0 0 3px rgba(46,125,50,0.15); } .mab-dlg-input.bad { border-color:#d32f2f; box-shadow:0 0 0 3px rgba(211,47,47,0.12); } .mab-dlg-hint { margin-top:7px; font-size:12px; font-weight:600; color:#6b7f66; min-height:17px; } .mab-dlg-hint.bad { color:#c62828; } .mab-dlg-hint.ok { color:#2e7d32; } .mab-dlg-words { margin-top:8px; background:#fff; border:1px dashed #9fbf96; border-radius:10px; padding:8px 12px; font-size:17px; font-weight:700; color:#2f6b1f; min-height:40px; text-align:right; line-height:1.7; } .mab-dlg-warn { margin-top:8px; background:#fff4e0; border:1.5px solid #e08a00; border-radius:10px; padding:7px 10px; font-size:12.5px; font-weight:700; color:#8a4b00; direction:rtl; text-align:right; } .mab-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; } .mab-chip { flex:1 0 14%; background:#fff; border:1.5px solid #2f6b1f; color:#2f6b1f; border-radius:10px; padding:9px 0; font-size:15px; font-weight:800; cursor:pointer; } .mab-chip:active { background:#e6f3e2; } .mab-dlg-actions { display:flex; gap:10px; margin-top:14px; } .mab-lock { width:100%; margin-top:10px; display:flex; align-items:center; gap:8px; direction:rtl; text-align:right; background:#fff; border:1.5px solid #b9cdb3; border-radius:10px; padding:8px 10px; font-size:12.5px; font-weight:700; color:#4a5e45; cursor:pointer; font-family:inherit; } .mab-lock.open { background:#fff4e0; border-color:#e08a00; color:#8a4b00; } .mab-lock-ic { font-size:15px; } #mab-bc-input { text-align:center !important; direction:ltr !important; padding-left:3px !important; padding-right:0 !important; caret-color:#2e7d32; } #mab-am-input { text-align:center !important; direction:ltr !important; } #mab-am-input::placeholder { text-align:center !important; direction:rtl; opacity:1; color:#a9bba4; font-size:20px; } #mab-bc-input::placeholder { text-align:center !important; color:#a9bba4; opacity:1; letter-spacing:3px; } .mab-btn { flex:1; border:0; border-radius:12px; padding:13px 0; font-size:15px; font-weight:800; cursor:pointer; } .mab-btn-cancel { background:#e9eee7; color:#44533f; flex:0 0 32%; } .mab-btn-ok { background:linear-gradient(135deg,#2f6b1f,#4b8a2c); color:#fff; box-shadow:0 3px 8px rgba(0,0,0,0.25); } .mab-btn-ok:disabled { background:#b7c4b2; box-shadow:none; color:#eef3ec; cursor:not-allowed; } .mab-btn-ok.confirm { background:linear-gradient(135deg,#e08a00,#f2a21a); } `;
    document.head.appendChild(st);
  }

  function numToUrdu(n) {
    if (n === 0) return "صفر";
    const u = ["", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو", "دس", "گیارہ", "بارہ", "تیرہ", "چودہ", "پندرہ", "سولہ", "سترہ", "اٹھارہ", "انیس", "بیس", "اکیس", "بائیس", "تیئیس", "چوبیس", "پچیس", "چھبیس", "ستائیس", "اٹھائیس", "انتیس", "تیس", "اکتیس", "بتیس", "تینتیس", "چونتیس", "پینتیس", "چھتیس", "سینتیس", "اڑتیس", "انتالیس", "چالیس", "اکتالیس", "بیالیس", "تینتالیس", "چوالیس", "پینتالیس", "چھیالیس", "سینتالیس", "اڑتالیس", "انچاس", "پچاس", "اکیاون", "باون", "تریپن", "چون", "پچپن", "چھپن", "ستاون", "اٹھاون", "انسٹھ", "ساٹھ", "اکسٹھ", "باسٹھ", "تریسٹھ", "چونسٹھ", "پینسٹھ", "چھیاسٹھ", "سڑسٹھ", "اڑسٹھ", "انہتر", "ستر", "اکہتر", "بہتر", "تہتر", "چوہتر", "پچھتر", "چھہتر", "ستتر", "اٹھہتر", "اناسی", "اسی", "اکیاسی", "بیاسی", "تراسی", "چوراسی", "پچاسی", "چھیاسی", "ستاسی", "اٹھاسی", "نواسی", "نوے", "اکانوے", "بانوے", "ترانوے", "چورانوے", "پچانوے", "چھیانوے", "ستانوے", "اٹھانوے", "ننانوے"];
    const below1000 = (x) => {
      const p = [];
      const h = Math.floor(x / 100),
        r = x % 100;
      if (h) p.push(u[h] + " سو");
      if (r) p.push(u[r]);
      return p.join(" ");
    };
    const parts = [];
    const cr = Math.floor(n / 10000000);
    const lk = Math.floor((n % 10000000) / 100000);
    const th = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (cr) parts.push(below1000(cr) + " کروڑ");
    if (lk) parts.push(below1000(lk) + " لاکھ");
    if (th) parts.push(below1000(th) + " ہزار");
    if (rest) parts.push(below1000(rest));
    return parts.join(" ");
  }

  // =============================================================
  // آواز: لکھی ہوئی Box Code اور رقم اردو میں بول کر بتانا
  // =============================================================
  const VOICE_KEY = "mab_voice_on";
  const voiceOn = () => {
    try {
      return localStorage.getItem(VOICE_KEY) !== "0";
    } catch (e) {
      return true;
    }
  };
  const setVoice = (v) => {
    try {
      localStorage.setItem(VOICE_KEY, v ? "1" : "0");
    } catch (e) {}
  };
  // تینوں پیجز (Box Code / Amount / Cross Check) کا mute بٹن ایک ہی حالت شیئر کرتا ہے
  const paintAllSnd = () => {
    const on = voiceOn();
    document.querySelectorAll("[data-mab-mute]").forEach((b) => {
      b.textContent = on ? "🔊" : "🔇";
      b.style.opacity = on ? "1" : "0.65";
      b.title = on ? "آواز بند کریں" : "آواز چالو کریں";
    });
  };
  const toggleVoice = () => {
    const on = !voiceOn();
    setVoice(on);
    paintAllSnd();
    if (!on) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  };
  try {
    window.addEventListener("storage", (e) => {
      if (e.key === VOICE_KEY) paintAllSnd();
    });
  } catch (e) {}

  const URDU_LETTERS = {
    A: "اے", B: "بی", C: "سی", D: "ڈی", E: "ای", F: "ایف", G: "جی", H: "ایچ", I: "آئی", J: "جے", K: "کے", L: "ایل", M: "ایم",
    N: "این", O: "او", P: "پی", Q: "کیو", R: "آر", S: "ایس", T: "ٹی", U: "یو", V: "وی", W: "ڈبلیو", X: "ایکس", Y: "وائی", Z: "زیڈ",
  };
  const URDU_DIGITS = ["صفر", "ایک", "دو", "تین", "چار", "پانچ", "چھ", "سات", "آٹھ", "نو"];

  function boxCodeToUrduSpeech(code) {
    return (
      "باکس کوڈ، " +
      code
        .split("")
        .map((c) => (/\d/.test(c) ? URDU_DIGITS[+c] : URDU_LETTERS[c] || c))
        .join("، ")
    );
  }

  // مردانہ آواز: محفوظ کی ہوئی آواز > مردانہ نام والی اردو آواز > کوئی بھی اردو آواز (پِچ نیچی کر کے)
  const VOICE_URI_KEY = "mab_voice_uri";
  const VOICE_PITCH_KEY = "mab_voice_pitch";
  const lsGet = (k, d) => {
    try {
      const v = localStorage.getItem(k);
      return v === null ? d : v;
    } catch (e) {
      return d;
    }
  };
  const lsSet = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {}
  };
  const FEMALE_RE = /female|woman|girl|\bcfn\b|\bcfm\b|-f-|_f_|زنانہ/i;
  const MALE_RE =
    /(^|[^a-z])male([^a-z]|$)|\bman\b|\bboy\b|\burm\b|-m-|_m_|مردانہ/i;
  const vLabel = (x) => (x.name || "") + " " + (x.voiceURI || "");
  const allVoices = () =>
    (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
  const urduVoices = () => allVoices().filter((x) => /^ur/i.test(x.lang));
  // ہندی آوازیں اردو الفاظ دیوناگری میں پڑھ کر وہی اردو/ہندوستانی تلفظ دیتی ہیں (اکثر فونز میں مردانہ ہندی آواز ہوتی ہے)
  const speakVoices = () =>
    urduVoices().concat(allVoices().filter((x) => /^hi/i.test(x.lang)));
  try {
    allVoices();
    window.speechSynthesis.addEventListener("voiceschanged", () => allVoices());
  } catch (e) {}
  // پہلی ٹچ پر آواز کا انجن جگا دیں تاکہ کوڈ لکھتے ہی فوراً بول پڑے
  let ttsWarm = false;
  const warmTts = () => {
    if (ttsWarm) return;
    ttsWarm = true;
    try {
      const w = new SpeechSynthesisUtterance(" ");
      w.volume = 0;
      window.speechSynthesis.speak(w);
    } catch (e) {}
  };
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, warmTts, { once: true, capture: true })
  );

  // اردو الفاظ → دیوناگری (صرف وہ الفاظ جو یہ اسکرپٹ بولتا ہے)
  const HI_NUMS = ["सिफ़र", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस", "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ", "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी", "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे"];
  const HI_LET = {
    A: "ए", B: "बी", C: "सी", D: "डी", E: "ई", F: "एफ़", G: "जी", H: "एच", I: "आई", J: "जे", K: "के", L: "एल", M: "एम",
    N: "एन", O: "ओ", P: "पी", Q: "क्यू", R: "आर", S: "एस", T: "टी", U: "यू", V: "वी", W: "डब्ल्यू", X: "एक्स", Y: "वाई", Z: "ज़ेड",
  };
  let HI_MAP = null;
  function urduToDevanagari(text) {
    if (!HI_MAP) {
      HI_MAP = {
        جی: "जी",
        آپ: "आप",
        کا: "का",
        باکس: "बॉक्स",
        کوڈ: "कोड",
        ہے: "है",
        شکریہ: "शुक्रिया",
        کی: "की",
        رقم: "रक़म",
        روپے: "रुपये",
        ہجے: "हिज्जे",
        اگلا: "अगला",
        لفظ: "लफ़्ज़",
        سو: "सौ",
        ہزار: "हज़ार",
        لاکھ: "लाख",
        کروڑ: "करोड़",
        صفر: "सिफ़र",
      };
      for (let i = 0; i < 100; i++) HI_MAP[numToUrdu(i)] = HI_NUMS[i];
      Object.keys(URDU_LETTERS).forEach((k) => {
        HI_MAP[URDU_LETTERS[k]] = HI_LET[k];
      });
    }
    return String(text)
      .split(/([،۔,.:\s]+)/)
      .map((t) => {
        if (!t) return "";
        if (/^[،۔,.:\s]+$/.test(t)) return /[۔.]/.test(t) ? "। " : ", ";
        return HI_MAP[t] || t;
      })
      .join("");
  }

  function pickMaleVoice() {
    const ur = urduVoices();
    const saved = lsGet(VOICE_URI_KEY, "");
    let v = saved && speakVoices().find((x) => x.voiceURI === saved);
    if (v) return { voice: v, male: true, saved: true };
    const hiV = allVoices().filter((x) => /^hi/i.test(x.lang));
    const isM = (x) => MALE_RE.test(vLabel(x)) && !FEMALE_RE.test(vLabel(x));
    const notF = (x) => !FEMALE_RE.test(vLabel(x));
    // ترتیب: اردو مردانہ > ہندی مردانہ > اردو (غیر زنانہ) > ہندی (غیر زنانہ) > کوئی بھی
    // صارف کی منتخب کردہ ڈیفالٹ آواز: Urdu Pakistan (ur-PK)
    v = ur.find(
      (x) => /urdu\s*pakistan/i.test(x.name || "") || /^ur[-_]pk$/i.test(x.lang)
    );
    if (v) return { voice: v, male: true, saved: false };
    v = ur.find(isM) || hiV.find(isM);
    const male = !!v;
    if (!v) v = ur.find(notF) || hiV.find(notF);
    if (!v) v = ur[0] || hiV[0];
    return { voice: v || null, male, saved: false };
  }

  // آواز کا انجن پہلے سے جگانا (Fill دبانے کے لمحے، تاکہ پہلا کوڈ لکھتے ہی فوراً بولے)
  function warmVoiceNow() {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const pk = pickMaleVoice();
      const hi = pk.voice && /^hi/i.test(pk.voice.lang);
      const w = new SpeechSynthesisUtterance(
        hi ? urduToDevanagari("جی") : "جی"
      );
      if (pk.voice) {
        w.voice = pk.voice;
        w.lang = pk.voice.lang;
      } else w.lang = "ur-PK";
      w.volume = 0;
      w.rate = 2;
      synth.resume();
      synth.speak(w);
    } catch (e) {}
  }

  function speakUrdu(text, o) {
    o = o || {};
    if (!o.force && (!voiceOn() || !text)) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      // آوازیں ابھی لوڈ نہ ہوئی ہوں (پہلی بار) تو لوڈ ہوتے ہی بولیں
      if (!o.voice && !allVoices().length && !o._retry) {
        let n = 0;
        const t = setInterval(() => {
          n++;
          if (allVoices().length || n > 14) {
            clearInterval(t);
            speakUrdu(text, Object.assign({}, o, { _retry: 1 }));
          }
        }, 120);
        return;
      }
      const pk = o.voice ? { voice: o.voice, male: true } : pickMaleVoice();
      const hi = pk.voice && /^hi/i.test(pk.voice.lang);
      const u = new SpeechSynthesisUtterance(
        hi ? o.hiText || urduToDevanagari(text) : text
      );
      u.lang = pk.voice ? pk.voice.lang : "ur-PK";
      if (pk.voice) u.voice = pk.voice;
      const sp = parseFloat(lsGet(VOICE_PITCH_KEY, ""));
      u.pitch = !isNaN(sp) ? sp : 0.4; // نیچی پِچ = بھاری، گہری مردانہ آواز
      u.rate = o.queue ? 1.1 : 0.92; // ذرا آہستہ = بھاری، باوقار مردانہ لہجہ (ایک ایک حرف بولتے وقت ذرا تیز)
      u.volume = 1;
      const go = () => {
        try {
          synth.resume();
          synth.speak(u);
        } catch (e) {}
      };
      if (o.queue) {
        // ٹائپنگ کے ساتھ ساتھ: پچھلا حرف بغیر کاٹے بولنے دیں؛ بہت پیچھے رہ جائے تو پرانے چھوڑ کر تازہ بولیں
        if (o.fresh || (synth.pending && o.skipBacklog)) {
          synth.cancel();
          setTimeout(go, 40);
        } else go();
        return;
      }
      if (synth.speaking || synth.pending) {
        synth.cancel();
        setTimeout(go, 40);
      } else go(); // فوراً شروع
    } catch (e) {}
  }

  // آواز منتخب کرنے کی چھوٹی ونڈو
  function openVoicePicker() {
    const old = document.getElementById("mab-voice-ov");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.id = "mab-voice-ov";
    ov.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:14px;direction:rtl;font-family:inherit;";
    ov.innerHTML =
      '<div style="background:#fff;border-radius:16px;width:100%;max-width:420px;max-height:90vh;overflow:auto;padding:14px;">' +
      '<div style="font-weight:800;font-size:16px;color:#2f6b1f;margin-bottom:6px;">🎙 مردانہ آواز منتخب کریں</div>' +
      '<div style="font-size:12px;color:#5b6d57;margin-bottom:8px;">ہر آواز پر ▶ دبا کر سنیں، جو گہری مردانہ لگے اس پر ✔ دبائیں۔ ہندی (hi) آوازیں اردو الفاظ ہی بولتی ہیں، اکثر ان میں مردانہ آواز مل جاتی ہے۔</div>' +
      '<div id="mab-vp-list"></div>' +
      '<div style="font-weight:800;font-size:13px;margin:10px 0 6px;color:#2f6b1f;">آواز کی گہرائی</div>' +
      '<div id="mab-vp-pitch" style="display:flex;gap:6px;"></div>' +
      '<button type="button" id="mab-vp-close" class="mab-mini" style="margin-top:12px;width:100%;padding:11px;font-size:14px;">بند کریں</button></div>';
    document.body.appendChild(ov);
    const SAMPLE = "باکس کوڈ، اے بی سی، ایک، دو، تین۔ رقم، پانچ سو روپے";
    const list = ov.querySelector("#mab-vp-list");
    const render = () => {
      const vs = speakVoices();
      const saved = lsGet(VOICE_URI_KEY, "");
      if (!vs.length) {
        list.innerHTML =
          '<div style="font-size:12.5px;color:#c62828;font-weight:700;line-height:1.8;">اس فون میں کوئی اردو/ہندی آواز نہیں ملی۔ فون کی Settings > Text-to-speech output > Google > Install voice data میں اردو (پاکستان) کی آوازیں انسٹال کریں، پھر یہاں دوبارہ کھولیں۔</div>';
      } else {
        list.innerHTML = vs
          .map(
            (v, i) =>
              '<div style="display:flex;align-items:center;gap:6px;border:1.5px solid ' +
              (v.voiceURI === saved ? "#2f6b1f" : "#d5e0d1") +
              ';border-radius:10px;padding:7px 9px;margin-bottom:6px;">' +
              '<div style="flex:1;font-size:12.5px;font-weight:700;color:#33442f;direction:ltr;text-align:left;word-break:break-all;">' +
              (i + 1) +
              ". " +
              (v.name || v.voiceURI) +
              ' <span style="color:#8a8f88;font-weight:600;">(' +
              v.lang +
              (/^hi/i.test(v.lang) ? " – اردو الفاظ" : "") +
              ")</span></div>" +
              '<button type="button" data-t="' +
              i +
              '" class="mab-mini">▶</button>' +
              '<button type="button" data-s="' +
              i +
              '" class="mab-mini" style="' +
              (v.voiceURI === saved ? "background:#2f6b1f;color:#fff;" : "") +
              '">✔</button></div>'
          )
          .join("");
        list
          .querySelectorAll("[data-t]")
          .forEach((b) =>
            b.addEventListener("click", () =>
              speakUrdu(SAMPLE, { force: true, voice: vs[+b.dataset.t] })
            )
          );
        list.querySelectorAll("[data-s]").forEach((b) =>
          b.addEventListener("click", () => {
            lsSet(VOICE_URI_KEY, vs[+b.dataset.s].voiceURI);
            render();
            speakUrdu(SAMPLE, { force: true, voice: vs[+b.dataset.s] });
          })
        );
      }
    };
    render();
    try {
      window.speechSynthesis.addEventListener("voiceschanged", render);
    } catch (e) {}
    const pitchBox = ov.querySelector("#mab-vp-pitch");
    const PITCHES = [
      ["عام", "1"],
      ["گہری", "0.6"],
      ["بہت گہری", "0.4"],
      ["انتہائی بھاری", "0.2"],
    ];
    const renderPitch = () => {
      const cur = lsGet(VOICE_PITCH_KEY, "0.4");
      pitchBox.innerHTML = PITCHES.map(
        (x) =>
          '<button type="button" data-p="' +
          x[1] +
          '" class="mab-mini" style="flex:1;padding:10px 4px;' +
          (cur === x[1] ? "background:#2f6b1f;color:#fff;" : "") +
          '">' +
          x[0] +
          "</button>"
      ).join("");
      pitchBox.querySelectorAll("[data-p]").forEach((b) =>
        b.addEventListener("click", () => {
          lsSet(VOICE_PITCH_KEY, b.dataset.p);
          renderPitch();
          speakUrdu(SAMPLE, { force: true });
        })
      );
    };
    renderPitch();
    ov.querySelector("#mab-vp-close").addEventListener("click", () => {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
      ov.remove();
    });
  }

  // =============================================================
  // ہجے (Spelling) میں مدد: عام پاکستانی ناموں/دکانوں کے الفاظ سے موازنہ
  // =============================================================
  const SPELL_WORDS = (
    "Muhammad Mohammad Mohammed Ahmed Ahmad Ali Hassan Hasan Hussain Husain Usman Umar Omar Bilal Imran Irfan Kamran Adnan Faisal Fahad Farhan Farooq Furqan Hamza Haider Hanif Haris Ibrahim Ismail Ishaq Jameel Javed Junaid Kashif Khalid Khurram Mansoor Manzoor Mubashir Mudassar Mujahid Naeem Nadeem Nasir Naveed Noman Qasim Rashid Rizwan Saad Sadiq Saeed Salman Shahid Shahzad Shakeel Sharif Shoaib Sohail Sultan Tahir Talha Tariq Waqar Waseem Yaseen Yasir Younus Yousuf Zahid Zeeshan Zubair Abdullah Abdul Rehman Rahman Raheem Rahim Karim Kareem Siddique Siddiqui Qureshi Sheikh Chaudhry Khan Malik Butt Bhatti Mughal Syed Ansari Memon Baloch Rajput Gul Shah Hafiz Haji Mian Sardar Abu Bakr Asad Anwar Akram Arshad Aslam Azhar Aziz Danish Dawood Ejaz Fahim Fayyaz Ghulam Habib Hammad Iqbal Jabbar Kamal Latif Liaqat Mazhar Mehmood Mahmood Munir Murtaza Mustafa Nawaz Nazir Noor Pervaiz Qadir Rafiq Rauf Riaz Sabir Sajid Shafiq Shahbaz Shehzad Shabbir Suleman Sulaiman Tanveer Wahid Wasim Yahya Yaqoob Zafar Zain Zia Zulfiqar Fazal Ghous Madni Raza Qadri Attari Faizan Rehmat Rehmani Usmania Bismillah Baba " +
    "Store Stores General Karyana Kiryana Mart Traders Trader Enterprises Enterprise Brothers Bros Corner Center Centre Shop Medical Pharmacy Bakery Sweets Mobile Cloth House Electronics Electric Hardware Tailors Tailor Fresh Fruit Fruits Vegetable Vegetables Meat Milk Dairy Chakki Atta Flour Mill Cafe Hotel Restaurant Tikka Karahi Paan Cabin Garments Boutique Fabrics Collection Madina Medina Makkah Zamzam Jannat Al Madinah Super Market Departmental Provision Foods Food Bhai Sons"
  )
    .split(/\s+/)
    .filter(Boolean);
  const SPELL_SET = new Set(SPELL_WORDS.map((w) => w.toLowerCase()));
  const phKey = (w) =>
    w
      .toLowerCase()
      .replace(/ph/g, "f")
      .replace(/[yw]/g, "i")
      .replace(/(.)\1+/g, "$1")
      .replace(/(?!^)[aeiou]/g, "");
  function lev(a, b) {
    const m = a.length,
      n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      prev = cur;
    }
    return prev[n];
  }
  // لفظ کے لیے زیادہ سے زیادہ 2 قریب ترین درست ہجے
  function suggestFor(word) {
    const lw = word.toLowerCase();
    if (lw.length < 3 || SPELL_SET.has(lw)) return [];
    const k = phKey(lw),
      lim = lw.length <= 5 ? 1 : 2,
      out = [];
    for (const c of SPELL_WORDS) {
      const lc = c.toLowerCase();
      if (Math.abs(lc.length - lw.length) > lim) continue;
      const d = lev(lw, lc);
      if (d <= lim || (phKey(lc) === k && d <= 3)) out.push({ c, d });
    }
    out.sort((x, y) => x.d - y.d);
    return out.slice(0, 2).map((x) => x.c);
  }
  // ہر لفظ کا پہلا حرف بڑا (صرف انگلش الفاظ)
  const titleCase = (v) =>
    v
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(
        /[A-Za-z][A-Za-z'\-]*/g,
        (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      );
  const spellOut = (v) =>
    v
      .split(/\s+/)
      .filter(Boolean)
      .map((w) =>
        w
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase()
          .split("")
          .join(" ")
      )
      .filter(Boolean)
      .join(" | ");
  const spellSpeech = (v) =>
    "ہجے، " +
    v
      .split(/\s+/)
      .filter(Boolean)
      .map((w) =>
        w
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase()
          .split("")
          .map((c) => URDU_LETTERS[c] || c)
          .join("، ")
      )
      .filter(Boolean)
      .join("، اگلا لفظ، ");

  // =============================================================
  // وائس ان پٹ: بول کر Box Code اور رقم لکھوائیں (Chrome کی SpeechRecognition)
  // مثال: "باکس کوڈ ABC123 رقم 250" یا "اے بی سی ایک دو تین، دو سو پچاس"
  // =============================================================
  const VOICE_IN_LANG = "mab_voice_in_lang";
  const VOICE_IN_LANGS = ["ur-PK", "en-IN", "pa-Arab-PK", "hi-IN"];
  const VOICE_LANG_NAME = {
    "ur-PK": "اردو",
    "en-IN": "انگلش",
    "pa-Arab-PK": "پنجابی",
    "hi-IN": "ہندی",
  };
  const SP_LETTER = (() => {
    const m = {};
    Object.keys(URDU_LETTERS).forEach((k) => {
      m[URDU_LETTERS[k]] = k;
    });
    Object.assign(m, {
      ay: "A", bee: "B", be: "B", see: "C", sea: "C", dee: "D", ee: "E", eff: "F", ef: "F", gee: "G", jee: "G",
      aitch: "H", eye: "I", jay: "J", kay: "K", el: "L", em: "M", en: "N", oh: "O", pee: "P", cue: "Q", queue: "Q",
      are: "R", ess: "S", tee: "T", you: "U", vee: "V", ex: "X", why: "Y", zee: "Z", zed: "Z",
      بے: "B", سے: "C", ڈے: "D", جے: "J", کے: "K",
    });
    return m;
  })();
  const SP_DIGIT = (() => {
    const m = {};
    URDU_DIGITS.forEach((w, i) => {
      m[w] = String(i);
    });
    Object.assign(m, {
      zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
      to: "2", too: "2", for: "4", won: "1",
      چھے: "6", نَو: "9",
    });
    return m;
  })();
  const EN_NUM = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };
  function enWordsToNum(ws) {
    let total = 0,
      cur = 0,
      seen = false;
    for (const w of ws) {
      if (w in EN_NUM) {
        cur += EN_NUM[w];
        seen = true;
      } else if (w === "hundred") {
        cur = (cur || 1) * 100;
        seen = true;
      } else if (w === "thousand") {
        total += (cur || 1) * 1000;
        cur = 0;
        seen = true;
      } else if (w === "lakh" || w === "lac") {
        total += (cur || 1) * 100000;
        cur = 0;
        seen = true;
      } else if (w === "and") continue;
      else return 0;
    }
    return seen ? total + cur : 0;
  }
  let URDU_NUM_MAP = null;
  function urduWordsToNum(str) {
    if (!URDU_NUM_MAP) {
      URDU_NUM_MAP = new Map();
      for (let n = 1; n <= 99999; n++)
        URDU_NUM_MAP.set(numToUrdu(n).replace(/\s+/g, " ").trim(), n);
      [
        ["ڈھائی سو", 250],
        ["ڈیڑھ سو", 150],
        ["ساڑھے تین سو", 350],
        ["ساڑھے چار سو", 450],
        ["ڈھائی ہزار", 2500],
        ["ڈیڑھ ہزار", 1500],
        ["ساڑھے تین ہزار", 3500],
      ].forEach((a) => URDU_NUM_MAP.set(a[0], a[1]));
    }
    return URDU_NUM_MAP.get(str.replace(/\s+/g, " ").trim()) || 0;
  }
  const SP_NOISE =
    /^(box|code|boxcode|amount|rupees?|rupay|rupaye|rupe|rs|pkr|and|is|the|باکس|بکس|بوکس|کوڈ|کود|رقم|روپے|روپیہ|روپئیے|روپیاں|اور|ہے|نیں|کا|کی|دا|دی|پیسے|बॉक्स|बाक्स|कोड|रुपये|रुपए|रक़म|रकम|है|ਬਾਕਸ|ਕੋਡ|ਰੁਪਏ|ਰਕਮ)$/;
  // پنجابی / ہندی / گرمکھی / رومن الفاظ: حروف اور ہندسے
  Object.keys(HI_LET).forEach((k) => {
    SP_LETTER[HI_LET[k]] = k;
  });
  Object.assign(SP_LETTER, {
    सि: "C", बि: "B",
    ਏ: "A", ਬੀ: "B", ਸੀ: "C", ਡੀ: "D", ਈ: "E", ਐਫ: "F", ਜੀ: "G", ਐਚ: "H", ਆਈ: "I", ਜੇ: "J", ਕੇ: "K", ਐਲ: "L", ਐਮ: "M",
    ਐਨ: "N", ਓ: "O", ਪੀ: "P", ਕਿਊ: "Q", ਆਰ: "R", ਐਸ: "S", ਟੀ: "T", ਯੂ: "U", ਵੀ: "V", ਡਬਲਯੂ: "W", ਐਕਸ: "X", ਵਾਈ: "Y", ਜ਼ੈੱਡ: "Z",
    اے: "A", بِی: "B", سِی: "C", ایچ: "H", آئے: "I", کیے: "K", ٹِی: "T",
  });
  HI_NUMS.slice(0, 10).forEach((w, i) => {
    SP_DIGIT[w] = String(i);
  });
  Object.assign(SP_DIGIT, {
    اک: "1", اکّ: "1", اکھ: "1", تن: "3", تِن: "3", پنج: "5", چھے: "6", چھیہ: "6", ست: "7", ستّ: "7", اٹھ: "8", اٹھّ: "8",
    نوں: "9", نَوں: "9", سفر: "0", سنّ: "0",
    ik: "1", ikk: "1", ek: "1", do: "2", dou: "2", teen: "3", tin: "3", char: "4", chaar: "4", panj: "5", panch: "5", paanch: "5",
    chhe: "6", chhay: "6", cheh: "6", che: "6", saat: "7", satt: "7", sat: "7", aath: "8", atth: "8", ath: "8",
    nau: "9", nou: "9", nao: "9", sifar: "0", siffar: "0",
    ਇੱਕ: "1", ਇਕ: "1", ਦੋ: "2", ਤਿੰਨ: "3", ਚਾਰ: "4", ਪੰਜ: "5", ਛੇ: "6", ਸੱਤ: "7", ਅੱਠ: "8", ਨੌਂ: "9", ਸਿਫ਼ਰ: "0",
  });

  // رقم کے الفاظ (اردو، پنجابی، ہندی، گرمکھی، رومن، انگلش) → عدد
  const LOOSE_UNIT = {},
    LOOSE_MULT = {},
    LOOSE_HALF = {
      ڈیڑھ: 1.5, ڈیڈھ: 1.5, डेढ़: 1.5, ਡੇਢ: 1.5, dedh: 1.5, derh: 1.5,
      ڈھائی: 2.5, اڈھائی: 2.5, اڑھائی: 2.5, ढाई: 2.5, ਢਾਈ: 2.5, dhai: 2.5, adhai: 2.5,
    };
  (() => {
    for (let n = 0; n < 100; n++) {
      const u = numToUrdu(n);
      if (u && !/\s/.test(u)) LOOSE_UNIT[u] = n;
      if (HI_NUMS[n]) LOOSE_UNIT[HI_NUMS[n]] = n;
    }
    Object.keys(EN_NUM).forEach((k) => {
      LOOSE_UNIT[k] = EN_NUM[k];
    });
    const add = (n, arr) =>
      arr.forEach((w) => {
        LOOSE_UNIT[w] = n;
      });
    add(1, ["اک", "اکّ", "ایک", "ik", "ikk", "ek", "ਇੱਕ"]);
    add(2, ["دو", "do", "ਦੋ"]);
    add(3, ["تن", "تِن", "تین", "tin", "teen", "ਤਿੰਨ"]);
    add(4, ["چار", "char", "chaar", "ਚਾਰ"]);
    add(5, ["پنج", "پانچ", "panj", "panch", "paanch", "ਪੰਜ"]);
    add(6, ["چھے", "چھ", "چھیہ", "chhe", "chhay", "cheh", "ਛੇ"]);
    add(7, ["ست", "ستّ", "سات", "saat", "satt", "sat", "ਸੱਤ"]);
    add(8, ["اٹھ", "اٹھّ", "آٹھ", "aath", "atth", "ath", "ਅੱਠ"]);
    add(9, ["نوں", "نو", "nau", "nou", "nao", "ਨੌਂ"]);
    add(10, ["دس", "das", "ਦਸ"]);
    add(17, ["ستارہ"]);
    add(19, ["انیہہ"]);
    add(20, ["ویہہ", "وی", "veeh", "ਵੀਹ"]);
    add(30, ["تریہہ", "تیس", "treeh", "ਤੀਹ"]);
    add(40, ["چالی", "chali", "ਚਾਲੀ"]);
    add(50, ["پنجاہ", "پچاس", "panjah", "ਪੰਜਾਹ"]);
    add(60, ["ساٹھ", "saath", "ਸੱਠ"]);
    add(70, ["ستر", "sattar", "ਸੱਤਰ"]);
    add(80, ["اسی", "assi", "ਅੱਸੀ"]);
    add(90, ["نوے", "nabbe", "ਨੱਬੇ"]);
    [
      ["سو", "سؤ", "sau", "so", "सौ", "ਸੌ", "ਸੋ"],
      ["ہزار", "ہجار", "hazar", "hazaar", "hajar", "हज़ार", "हजार", "ਹਜ਼ਾਰ", "ਹਜ਼ਾਰ"],
      ["لکھ", "لاکھ", "lakh", "lac", "लाख", "ਲੱਖ"],
    ].forEach((arr, i) =>
      arr.forEach((w) => {
        LOOSE_MULT[w] = [100, 1000, 100000][i];
      })
    );
  })();
  function looseWordsToNum(ws) {
    ws = ws.filter((w) => !SP_NOISE.test(w));
    if (!ws.length) return 0;
    // سارے الگ الگ ہندسے (مثلاً "پانچ صفر صفر") → 500
    if (
      ws.length >= 2 &&
      ws.every((w) => w in LOOSE_UNIT && LOOSE_UNIT[w] < 10)
    )
      return parseInt(ws.map((w) => LOOSE_UNIT[w]).join(""), 10) || 0;
    let total = 0,
      cur = 0,
      half = 0,
      sade = false,
      seen = false;
    for (const w of ws) {
      if (w in LOOSE_HALF) {
        half = LOOSE_HALF[w];
        seen = true;
        continue;
      }
      if (
        w === "ساڑھے" ||
        w === "साढ़े" ||
        w === "ਸਾਢੇ" ||
        w === "sarhe" ||
        w === "sade"
      ) {
        sade = true;
        seen = true;
        continue;
      }
      if (w in LOOSE_UNIT) {
        if (sade) {
          half = LOOSE_UNIT[w] + 0.5;
          sade = false;
        } else cur += LOOSE_UNIT[w];
        seen = true;
        continue;
      }
      if (w in LOOSE_MULT) {
        const m = LOOSE_MULT[w],
          base = half || cur || 1;
        if (m === 100) cur = (half ? 0 : 0) + base * 100 + (half ? 0 : 0);
        else {
          total += base * m;
          cur = 0;
        }
        if (m === 100 && half) {
          half = 0;
        } else if (m !== 100) half = 0;
        seen = true;
        continue;
      }
      if (w === "اور" || w === "and") continue;
      return 0;
    }
    if (half) return 0;
    return seen ? Math.round(total + cur) : 0;
  }

  // بولا ہوا متن → { code, amount }
  function parseVoiceEntry(text) {
    let t = String(text || "")
      .toLowerCase()
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
      .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966))
      .replace(/[੦-੯]/g, (c) => String(c.charCodeAt(0) - 0x0a66))
      .replace(/(\d)[,٬](?=\d{3})/g, "$1")
      .replace(/[.,،؟?!]/g, " ");
    const tok = t.split(/\s+/).filter(Boolean);
    const ch = tok.map((w) => {
      if (
        /^[a-z0-9]+$/.test(w) &&
        !SP_NOISE.test(w) &&
        !(w in SP_LETTER) &&
        !(w in SP_DIGIT)
      )
        return w.toUpperCase();
      if (w in SP_LETTER) return SP_LETTER[w];
      if (w in SP_DIGIT) return SP_DIGIT[w];
      return null;
    });
    let code = "",
      used = new Set(),
      partial = "";
    for (let i = 0; i < tok.length; i++) {
      let run = "";
      for (let j = i; j < tok.length && ch[j] !== null && run.length < 6; j++)
        run += ch[j];
      if (/^[A-Z]{3}/.test(run) && run.length > partial.length) partial = run;
    }
    for (let i = 0; i < tok.length && !code; i++) {
      let acc = "";
      for (let j = i; j < tok.length; j++) {
        if (ch[j] === null) break;
        acc += ch[j];
        if (acc.length > 6) break;
        if (/^[A-Z]{3}\d{3}$/.test(acc)) {
          code = acc;
          for (let k = i; k <= j; k++) used.add(k);
          break;
        }
      }
    }
    // رقم: بچے ہوئے الفاظ سے
    const rest = tok.filter((w, i) => !used.has(i) && !SP_NOISE.test(w));
    let amount = 0;
    const dig = rest.filter((w) => /^\d+$/.test(w));
    if (dig.length) amount = parseInt(dig[dig.length - 1], 10);
    if (!amount)
      amount =
        urduWordsToNum(rest.join(" ")) ||
        enWordsToNum(rest) ||
        looseWordsToNum(rest);
    if (!amount && rest.length > 1) {
      // آخری حصہ آزما کر دیکھیں (مثلاً فالتو لفظ ہو)
      for (let a = 1; a < rest.length && !amount; a++)
        amount =
          urduWordsToNum(rest.slice(a).join(" ")) ||
          enWordsToNum(rest.slice(a)) ||
          looseWordsToNum(rest.slice(a));
    }
    if (amount > 9999999) amount = 0;
    return { code, amount: amount || 0, partial: code ? "" : partial };
  }

  let activeRec = null;
  // status(kind, msg): kind = 'listen' | 'ok' | 'err'
  function listenVoice(btn, onAlts, status) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      status("err", "اس براؤزر میں وائس ان پٹ نہیں، Chrome استعمال کریں");
      return;
    }
    if (activeRec) {
      try {
        activeRec.stop();
      } catch (e) {}
      return;
    }
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
    const rec = new SR();
    const lang = lsGet(VOICE_IN_LANG, VOICE_IN_LANGS[0]);
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 8;
    activeRec = rec;
    const idle = () => {
      activeRec = null;
      if (btn) {
        btn.textContent = "🎙️";
        btn.style.background = "";
      }
    };
    let got = false;
    rec.onstart = () => {
      if (btn) {
        btn.textContent = "🔴";
      }
      status("listen", "🎙 بولیں… (" + (VOICE_LANG_NAME[lang] || lang) + ")");
    };
    rec.onresult = (ev) => {
      got = true;
      const alts = [];
      const r = ev.results[ev.results.length - 1];
      for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
      const ok = onAlts(alts);
      if (!ok) {
        // اگلی بار دوسری زبان آزمائیں
        const next =
          VOICE_IN_LANGS[
            (VOICE_IN_LANGS.indexOf(lang) + 1) % VOICE_IN_LANGS.length
          ];
        lsSet(VOICE_IN_LANG, next);
      }
    };
    rec.onerror = (ev) => {
      got = true;
      if (ev.error === "language-not-supported") {
        lsSet(
          VOICE_IN_LANG,
          VOICE_IN_LANGS[
            (VOICE_IN_LANGS.indexOf(lang) + 1) % VOICE_IN_LANGS.length
          ]
        );
        status(
          "err",
          "⚠️ یہ زبان فون میں نہیں، اگلی زبان لگا دی — 🎙 دوبارہ دبائیں"
        );
        return;
      }
      const m = {
        "not-allowed": "مائیکروفون کی اجازت دیں",
        "service-not-allowed": "مائیکروفون کی اجازت دیں",
        "no-speech": "آواز نہیں آئی، دوبارہ بولیں",
        network: "انٹرنیٹ چیک کریں",
        "language-not-supported": "یہ زبان سپورٹ نہیں",
      };
      status("err", "⚠️ " + (m[ev.error] || "وائس ان پٹ ناکام: " + ev.error));
    };
    rec.onend = () => {
      idle();
      if (!got) status("err", "آواز نہیں آئی، دوبارہ بولیں");
    };
    try {
      rec.start();
    } catch (e) {
      idle();
      status("err", "⚠️ وائس شروع نہ ہو سکی");
    }
  }

  function openDialog(title, bodyHtml, opts) {
    opts = opts || {};
    injectDialogStyle();
    const old = document.getElementById("mab-dlg-overlay");
    if (old) old.remove();
    const ov = document.createElement("div");
    ov.id = "mab-dlg-overlay";
    ov.innerHTML = `<div class="mab-dlg"><div class="mab-dlg-head"><span>${title}</span><button type="button" data-mab-rep class="mab-snd" title="دوبارہ سنیں">🔁</button><button type="button" data-mab-mic class="mab-snd" title="بول کر لکھیں">🎙️</button><button type="button" data-mab-mute class="mab-snd" title="آواز"></button></div><div class="mab-dlg-body">${bodyHtml}</div></div>`;
    document.body.appendChild(ov);
    try {
      if (window.__mabCalcFront) setTimeout(window.__mabCalcFront, 0);
    } catch (e) {}
    const snd = ov.querySelector("[data-mab-mute]");
    const rep = ov.querySelector("[data-mab-rep]");
    const mic = ov.querySelector("[data-mab-mic]");
    if (opts.noSnd || !opts.mic) mic.remove();
    else if (!(window.SpeechRecognition || window.webkitSpeechRecognition))
      mic.addEventListener("click", () => {
        // Firefox وغیرہ: براؤزر کی وائس پہچان نہیں، کی بورڈ کے مائیک سے بولیں
        const i = ov.querySelector("input");
        try {
          if (i) i.focus();
        } catch (e) {}
        if (ov.__voiceStatus)
          ov.__voiceStatus("ok", "🎙 کی بورڈ کے مائیک والے بٹن سے بولیں");
      });
    else
      mic.addEventListener("click", () =>
        listenVoice(
          mic,
          (alts) => (ov.__onVoice ? ov.__onVoice(alts) : false),
          (k, m) => {
            if (ov.__voiceStatus) ov.__voiceStatus(k, m);
          }
        )
      );
    if (opts.noSnd) {
      snd.remove();
      rep.remove();
    } else {
      if (!opts.replay) rep.remove();
      else
        rep.addEventListener("click", () => {
          try {
            if (ov.__replay) ov.__replay();
          } catch (e) {}
        });
      snd.addEventListener("click", toggleVoice);
    }
    if (opts.scroll) {
      ov.style.paddingTop = "10px";
      ov.querySelector(".mab-dlg").style.cssText +=
        ";max-height:92vh;overflow-y:auto;";
    }
    paintAllSnd();
    return ov;
  }

  // Box Code کا فارمیٹ: صرف ABC123 (3 انگلش حروف + 3 ہندسے)
  const BOX_FORMATS_BASE = [{ label: "ABC123", re: /^[A-Z]{3}\d{3}$/ }];
  const BOX_FORMATS_EXTRA = []; // اب کوئی اضافی فارمیٹ نہیں

  function askBoxCode() {
    return new Promise((resolve) => {
      const ov = openDialog(
        "📦 Box Code",
        ` <div class="mab-dlg-label"><span>Box Code درج کریں</span><span id="mab-bc-count">0 / 6</span></div> <input id="mab-bc-input" class="mab-dlg-input" type="text" inputmode="email" lang="en" dir="ltr" enterkeyhint="done" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:3px;text-align:center;"> <div id="mab-bc-hint" class="mab-dlg-hint"></div> <div class="mab-dlg-actions"> <button id="mab-bc-cancel" class="mab-btn mab-btn-cancel">منسوخ</button> <button id="mab-bc-ok" class="mab-btn mab-btn-ok" disabled>آگے بڑھیں ➜</button> </div>`,
        { replay: true, mic: true }
      );
      window.__mabVoiceAmount = "";
      const inp = ov.querySelector("#mab-bc-input");
      const cnt = ov.querySelector("#mab-bc-count");
      const hint = ov.querySelector("#mab-bc-hint");
      const ok = ov.querySelector("#mab-bc-ok");
      let unlocked = false;
      let lastSpoken = "";
      const done = (v) => {
        ov.remove();
        resolve(v);
      };

      const formats = () =>
        unlocked
          ? BOX_FORMATS_BASE.concat(BOX_FORMATS_EXTRA)
          : BOX_FORMATS_BASE;

      const filter = (raw) => {
        const chars = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
        let out = "",
          letters = 0,
          digitSeen = false;
        for (const c of chars) {
          if (out.length >= 6) break;
          const isL = /[A-Z]/.test(c);
          if (!unlocked) {
            if (out.length < 3) {
              if (isL) out += c;
            } else if (!isL) out += c;
          } else if (isL) {
            if (!digitSeen && letters < 4) {
              out += c;
              letters++;
            }
          } else {
            digitSeen = true;
            out += c;
          }
        }
        return out;
      };

      ov.__voiceStatus = (k, m) => {
        hint.className =
          "mab-dlg-hint" + (k === "err" ? " bad" : k === "ok" ? " ok" : "");
        hint.textContent = m;
      };
      ov.__onVoice = (alts) => {
        const rs = alts.map(parseVoiceEntry);
        const full = rs.find((r) => r.code);
        const amtR = rs.find((r) => r.amount);
        if (amtR) window.__mabVoiceAmount = String(amtR.amount);
        if (full) {
          inp.value = full.code;
          update();
          ov.__voiceStatus(
            "ok",
            "🎙 کوڈ: " + full.code + (amtR ? " · رقم: " + amtR.amount : "")
          );
          return true;
        }
        const pr = amtR ? null : rs.find((r) => r.partial);
        if (pr) {
          // آدھا کوڈ ملا: بھر دیں، باقی خود لکھ لیں
          inp.value = pr.partial;
          update();
          ov.__voiceStatus(
            "err",
            "🎙 آدھا کوڈ ملا: " +
              pr.partial +
              " — باقی خود لکھیں یا دوبارہ بولیں"
          );
          try {
            inp.focus();
          } catch (e) {}
          return true;
        }
        if (amtR) {
          ov.__voiceStatus(
            "ok",
            "🎙 رقم: " + amtR.amount + " — کوڈ دوبارہ بولیں"
          );
          return true;
        }
        ov.__voiceStatus(
          "err",
          "سنا: " +
            (alts[0] || "") +
            " — دوبارہ بولیں (حروف: اے بی سی، پھر ہندسے)"
        );
        return false;
      };
      ov.__replay = () =>
        speakUrdu(
          inp.value
            ? boxCodeToUrduSpeech(filter(inp.value))
            : "باکس کوڈ درج کریں",
          { force: true }
        );
      let prevBc = "";
      const update = () => {
        // کی بورڈ سے بولا گیا جملہ (مثلاً "abc 123 رقم 250") سمجھ کر کوڈ اور رقم الگ کریں
        const rawV = inp.value;
        if (
          /\s/.test(rawV.trim()) ||
          rawV.replace(/[^A-Za-z0-9]/g, "").length > 6
        ) {
          const r = parseVoiceEntry(rawV);
          if (r.amount) window.__mabVoiceAmount = String(r.amount);
          if (r.code) inp.value = r.code;
        }
        const nonLatin = /[\u0600-\u06FF\u0750-\u077F]/.test(inp.value);
        const clean = filter(inp.value);
        if (inp.value !== clean) inp.value = clean;
        const n = clean.length;
        const valid = formats().some((f) => f.re.test(clean));
        cnt.textContent = n + " / 6";
        inp.classList.toggle("ok", valid);
        inp.classList.toggle("bad", n === 6 && !valid);
        hint.className =
          "mab-dlg-hint" + (valid ? " ok" : n === 6 ? " bad" : "");
        if (valid) hint.textContent = "✔ درست ہے";
        else if (n === 6) hint.textContent = "صرف ABC123 فارمیٹ چلتا ہے";
        else if (n === 0)
          hint.textContent = "فارمیٹ ABC123: پہلے 3 انگلش حروف، پھر 3 ہندسے";
        else hint.textContent = "ابھی " + (6 - n) + " مزید باقی ہیں";
        if (nonLatin) {
          hint.className = "mab-dlg-hint bad";
          hint.textContent = "⚠️ کی بورڈ کو انگلش (ABC) پر کریں";
        }
        ok.disabled = !valid;
        // ہر حرف پر نہیں بولتا؛ صرف کوڈ مکمل اور درست ہونے پر پورا کوڈ ایک بار بولیں
        const grew = clean.length > prevBc.length;
        prevBc = clean;
        if (!grew && !clean) {
          try {
            window.speechSynthesis.cancel();
          } catch (e) {}
        }
        if (valid && clean !== lastSpoken) {
          lastSpoken = clean;
          speakUrdu(boxCodeToUrduSpeech(clean));
        }
        if (!valid) lastSpoken = "";

        // کی بورڈ: مقفل میں 3 حروف کے بعد، ان لاک میں پہلا ہندسہ لکھتے ہی (یا 4 حروف کے بعد) نمبر پیڈ
        const letters = (clean.match(/^[A-Z]*/) || [""])[0].length;
        const hasDigit = /\d/.test(clean);
        const wantMode =
          n > 0 && (unlocked ? hasDigit || letters >= 4 : n >= 3)
            ? "numeric"
            : "email";
        if (inp.getAttribute("inputmode") !== wantMode) {
          inp.setAttribute("inputmode", wantMode);
          try {
            inp.blur();
            inp.focus();
            inp.setSelectionRange(n, n);
          } catch (e) {}
        }
      };

      inp.addEventListener("input", update);
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !ok.disabled) done(inp.value);
      });
      ok.addEventListener("click", () => {
        if (!ok.disabled) done(inp.value);
      });
      ov.querySelector("#mab-bc-cancel").addEventListener("click", () =>
        done(null)
      );
      update();
      setTimeout(() => {
        try {
          inp.focus();
        } catch (e) {}
      }, 50);
    });
  }

  function askAmount() {
    const LARGE = 10000,
      MAXDIGITS = 7;
    return new Promise((resolve) => {
      const ov = openDialog(
        "رقم / Amount",
        ` <div class="mab-dlg-label"><span>رقم لکھیں (روپے)</span><span id="mab-am-fmt"></span></div> <input id="mab-am-input" class="mab-dlg-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${MAXDIGITS}" autocomplete="off" placeholder="یہاں رقم لکھیں" style="text-align:center;"> <div id="mab-am-hint" class="mab-dlg-hint">صرف اعداد، 0 سے زیادہ</div> <div id="mab-am-words" class="mab-dlg-words" dir="rtl">—</div> <div id="mab-am-warn" class="mab-dlg-warn" style="display:none;">⚠️ بڑی رقم ہے، ایک بار پھر چیک کر لیں</div> <div class="mab-chips"> ${[100, 150, 200, 250, 300, 500]
          .map(
            (v) =>
              `<button type="button" class="mab-chip" data-v="${v}">${v}</button>`
          )
          .join("")} </div> <div class="mab-dlg-actions" style="margin-top:14px;"> <button id="mab-am-cancel" class="mab-btn mab-btn-cancel">منسوخ</button> <button id="mab-am-ok" class="mab-btn mab-btn-ok" disabled>✔ محفوظ کریں اور Process</button> </div>`,
        { replay: true, mic: true }
      );
      const inp = ov.querySelector("#mab-am-input");
      const hint = ov.querySelector("#mab-am-hint");
      const words = ov.querySelector("#mab-am-words");
      const warn = ov.querySelector("#mab-am-warn");
      const fmt = ov.querySelector("#mab-am-fmt");
      const ok = ov.querySelector("#mab-am-ok");
      let armed = false;
      let speakTimer = null;
      let prevAm = "";
      ov.__voiceStatus = (k, m) => {
        hint.className =
          "mab-dlg-hint" + (k === "err" ? " bad" : k === "ok" ? " ok" : "");
        hint.textContent = m;
      };
      ov.__onVoice = (alts) => {
        for (const a of alts) {
          const r = parseVoiceEntry(a);
          if (r.amount) {
            inp.value = String(r.amount);
            update();
            return true;
          }
        }
        ov.__voiceStatus(
          "err",
          "رقم سمجھ نہیں آئی: " + (alts[0] || "") + " — دوبارہ بولیں"
        );
        return false;
      };
      ov.__replay = () => {
        const v = parseInt(inp.value.replace(/\D/g, ""), 10) || 0;
        speakUrdu(v > 0 ? "رقم، " + numToUrdu(v) + " روپے" : "رقم درج کریں", {
          force: true,
        });
      };
      warmVoiceNow(); // ڈائیلاگ کھلتے ہی انجن جگا دیں تاکہ پہلی رقم پر ہی فوراً بولے
      const done = (v) => {
        clearTimeout(speakTimer);
        ov.remove();
        resolve(v);
      };
      const okLabel = "✔ محفوظ کریں اور Process";

      const update = () => {
        if (/[^\d\s,]/.test(inp.value)) {
          const r = parseVoiceEntry(inp.value);
          if (r.amount) inp.value = String(r.amount);
        } // بولے ہوئے الفاظ ("دو سو پچاس") کو عدد بنائیں
        const clean = inp.value
          .replace(/\D/g, "")
          .replace(/^0+/, "")
          .slice(0, MAXDIGITS);
        if (inp.value !== clean) inp.value = clean;
        armed = false;
        ok.classList.remove("confirm");
        ok.textContent = okLabel;
        const n = clean ? parseInt(clean, 10) : 0;
        const valid = n > 0;
        inp.classList.toggle("ok", valid);
        fmt.textContent = valid ? "PKR " + n.toLocaleString("en-US") : "";
        words.textContent = valid ? numToUrdu(n) + " روپے صرف" : "—";
        hint.className = "mab-dlg-hint" + (valid ? " ok" : "");
        hint.textContent = valid ? "✔ رقم درست ہے" : "صرف اعداد، 0 سے زیادہ";
        warn.style.display = n >= LARGE ? "block" : "none";
        ok.disabled = !valid;
        clearTimeout(speakTimer);
        const typedOne =
          clean.length === prevAm.length + 1 && clean.startsWith(prevAm);
        prevAm = clean;
        // ہر ہندسے پر نہیں بولتا؛ لکھنا رکنے کے بعد پوری رقم ایک بار بولیں
        if (!valid) {
          try {
            window.speechSynthesis.cancel();
          } catch (e) {}
        } else
          speakTimer = setTimeout(
            () => {
              speakUrdu("رقم، " + numToUrdu(n) + " روپے");
            },
            typedOne ? 700 : 120
          );
      };
      const submit = () => {
        if (ok.disabled) return;
        const n = parseInt(inp.value, 10);
        if (n >= LARGE && !armed) {
          armed = true;
          ok.classList.add("confirm");
          ok.textContent = "ہاں، " + n.toLocaleString("en-US") + " درست ہے";
          return;
        }
        done(inp.value);
      };
      inp.addEventListener("input", update);
      ["pointerdown", "touchstart", "focus"].forEach((ev) =>
        inp.addEventListener(ev, warmVoiceNow, { once: true })
      );
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      ok.addEventListener("click", submit);
      ov.querySelector("#mab-am-cancel").addEventListener("click", () =>
        done(null)
      );
      ov.querySelectorAll(".mab-chip").forEach((c) =>
        c.addEventListener("click", () => {
          inp.value = c.dataset.v;
          update();
        })
      );
      if (window.__mabVoiceAmount) {
        inp.value = window.__mabVoiceAmount;
        window.__mabVoiceAmount = "";
        update();
      } // Box Code کے ساتھ بولی گئی رقم خود بھر دیں
      setTimeout(() => {
        try {
          inp.focus();
        } catch (e) {}
      }, 50);
    });
  }

  // =============================================================
  // غلط ڈیٹا کی درستی: سپروائزر کو واٹس ایپ پیغام
  // =============================================================
  const SUP_KEY = "mab_supervisor_wa";
  const getSup = () => {
    try {
      return localStorage.getItem(SUP_KEY) || "";
    } catch (e) {
      return "";
    }
  };
  const setSup = (v) => {
    try {
      localStorage.setItem(SUP_KEY, v);
    } catch (e) {}
  };
  const SUP_NAME_KEY = "mab_supervisor_name";
  const getSupName = () => {
    try {
      return localStorage.getItem(SUP_NAME_KEY) || "";
    } catch (e) {
      return "";
    }
  };
  const setSupName = (v) => {
    try {
      localStorage.setItem(SUP_NAME_KEY, v);
    } catch (e) {}
  };
  const canPickContact = () =>
    !!(navigator.contacts && navigator.contacts.select);
  // کسی بھی شکل (0300.., 300.., 92300..) کو 92300XXXXXXX بناتا ہے؛ غلط ہو تو ''
  function normPkMobile(v) {
    let d = String(v || "").replace(/\D/g, "");
    if (d.startsWith("0092")) d = d.slice(4);
    else if (d.startsWith("92")) d = d.slice(2);
    else if (d.startsWith("0")) d = d.slice(1);
    return /^3\d{9}$/.test(d) ? "92" + d : "";
  }

  // ڈائیلاگ کو چاروں کونوں سے پکڑ کر سائز بدلنے کی سہولت
  function makeResizable(ov, key) {
    const dlg = ov.querySelector(".mab-dlg");
    if (!dlg) return;
    const MINW = 260,
      MINH = 220;
    const W = () => window.innerWidth,
      H = () => window.innerHeight;
    const clampRect = (g) => {
      let w = Math.max(MINW, Math.min(g.w, W())),
        h = Math.max(MINH, Math.min(g.h, H()));
      let l = Math.max(0, Math.min(g.l, W() - w)),
        t = Math.max(0, Math.min(g.t, H() - h));
      return { l, t, w, h };
    };
    const apply = (g) => {
      const c = clampRect(g);
      Object.assign(dlg.style, {
        position: "fixed",
        left: c.l + "px",
        top: c.t + "px",
        width: c.w + "px",
        height: c.h + "px",
        maxWidth: "none",
        maxHeight: "none",
        margin: "0",
        overflowY: "auto",
      });
      place();
      return c;
    };
    const handles = {};
    const place = () => {
      const r = dlg.getBoundingClientRect(),
        S = 26;
      const pos = {
        tl: [r.left, r.top],
        tr: [r.right - S, r.top],
        bl: [r.left, r.bottom - S],
        br: [r.right - S, r.bottom - S],
      };
      Object.keys(handles).forEach((k) => {
        handles[k].style.left = pos[k][0] + "px";
        handles[k].style.top = pos[k][1] + "px";
      });
    };
    let saved = null;
    try {
      saved = JSON.parse(lsGet(key, "null"));
    } catch (e) {}
    const r0 = dlg.getBoundingClientRect();
    apply(
      saved && saved.w
        ? saved
        : {
            l: r0.left,
            t: r0.top,
            w: r0.width,
            h: Math.min(r0.height, H() - 16),
          }
    );
    [
      ["tl", "nwse-resize", "border-top-left-radius:14px;border-width:5px 0 0 5px;"],
      ["tr", "nesw-resize", "border-top-right-radius:14px;border-width:5px 5px 0 0;"],
      ["bl", "nesw-resize", "border-bottom-left-radius:14px;border-width:0 0 5px 5px;"],
      ["br", "nwse-resize", "border-bottom-right-radius:14px;border-width:0 5px 5px 0;"],
    ].forEach(([k, cur, shape]) => {
      const h = document.createElement("div");
      h.title = "کھینچ کر سائز بدلیں";
      h.style.cssText =
        "position:fixed;width:26px;height:26px;z-index:2147483647;touch-action:none;cursor:" +
        cur +
        ";border:0 solid #ffffff;box-shadow:none;" +
        shape +
        "border-color:#e08a00;background:transparent;box-sizing:border-box;";
      ov.appendChild(h);
      handles[k] = h;
      let g = null;
      h.addEventListener("pointerdown", (e) => {
        const r = dlg.getBoundingClientRect();
        g = {
          x: e.clientX,
          y: e.clientY,
          l: r.left,
          t: r.top,
          r: r.right,
          b: r.bottom,
        };
        try {
          h.setPointerCapture(e.pointerId);
        } catch (err) {}
        e.preventDefault();
        e.stopPropagation();
      });
      h.addEventListener("pointermove", (e) => {
        if (!g) return;
        e.preventDefault();
        const dx = e.clientX - g.x,
          dy = e.clientY - g.y;
        let l = g.l,
          t = g.t,
          r = g.r,
          b = g.b;
        if (k[1] === "l") l = Math.max(0, Math.min(g.l + dx, g.r - MINW));
        else r = Math.min(W(), Math.max(g.r + dx, g.l + MINW));
        if (k[0] === "t") t = Math.max(0, Math.min(g.t + dy, g.b - MINH));
        else b = Math.min(H(), Math.max(g.b + dy, g.t + MINH));
        apply({ l, t, w: r - l, h: b - t });
      });
      const end = () => {
        if (!g) return;
        g = null;
        const r = dlg.getBoundingClientRect();
        lsSet(
          key,
          JSON.stringify({
            l: Math.round(r.left),
            t: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
          })
        );
      };
      h.addEventListener("pointerup", end);
      h.addEventListener("pointercancel", end);
    });
    place();
    dlg.addEventListener("scroll", place);
    window.addEventListener("resize", () => {
      if (!ov.isConnected) return;
      const r = dlg.getBoundingClientRect();
      apply({ l: r.left, t: r.top, w: r.width, h: r.height });
    });
  }

  // صرف دکھانے کے لیے: 923004577834 → 300-45-77-834 (92 چھپا ہوا؛ ڈیٹا اور سپروائزر پیغام میں کوئی تبدیلی نہیں)
  function mobDisp(v) {
    let d = String(v == null ? "" : v).replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("92")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (!/^3\d{9}$/.test(d)) return v;
    return d.slice(0, 3) + "-" + d.slice(3, 5) + "-" + d.slice(5, 7) + "-" + d.slice(7);
  }
  function askCorrection(box, old, host, onClose) {
    const esc = (s) =>
      String(s == null ? "" : s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          }[c])
      );
    const oShop = old["Shop Name"] || "",
      oOwner = old["Shop Owner Name"] || "",
      oMob = old["Mobile Number"] || "",
      oAddr = old["Address"] || "",
      hasAddr = old["Address"] !== undefined;
    const sup = getSup();
    const supName0 = getSupName();
    const haveSup = !!(sup && supName0);

    const group = (title, id, oldVal, extra, spell) => ` <div class="mab-grp"> <div class="mab-grp-title">${title}</div> <div class="mab-old"><span>Old</span><div dir="auto">${esc(oldVal) || "—"}</div></div> <input id="${id}" class="mab-new" type="text" autocomplete="off" ${extra}> <div id="${id}-h" class="mab-fhint"></div> ${spell ? `<div id="${id}-sp" style="display:none;margin-top:6px;"></div>` : ""} </div>`;

    const corrHtml =
      ` ${group("دکان کا نام / Shop name", "mab-f-shop", oShop, 'placeholder="New Shop name (نیا نام)"', true)} ${group("مالک کا نام / Owner name", "mab-f-owner", oOwner, 'placeholder="New owner name (English only)" lang="en" autocorrect="off" autocapitalize="words" dir="ltr"', true)} ${group("موبائل / Mobile", "mab-f-mob", mobDisp(oMob), 'placeholder="0300-1234567" inputmode="numeric" dir="ltr"')} ${hasAddr ? group("ایڈریس / Address", "mab-f-addr", oAddr, 'placeholder="New Address (نیا ایڈریس)"') : ""} <div class="mab-grp" id="mab-sup-box"> <div class="mab-grp-title">سپروائزر / Supervisor</div> <div id="mab-sup-saved" style="display:${haveSup ? "flex" : "none"};align-items:center;justify-content:space-between;gap:8px;"> <div style="display:flex;flex-direction:column;gap:2px;font-weight:800;color:#2f6b1f;"> <span id="mab-sup-name-show" dir="auto" style="font-size:15px;">${esc(supName0)}</span> <span dir="ltr" id="mab-sup-show" style="font-size:14px;text-align:right;">${esc(sup)}</span> </div> <button type="button" id="mab-sup-edit" class="mab-mini">تبدیل</button> </div> <div id="mab-sup-edit-box" style="display:${haveSup ? "none" : "block"};"> <input id="mab-f-supname" class="mab-new" type="text" dir="auto" placeholder="سپروائزر کا نام (ایک بار لکھیں)" autocomplete="off" value="${esc(supName0)}"> <input id="mab-f-sup" class="mab-new" type="text" inputmode="numeric" dir="ltr" placeholder="3001234567" autocomplete="off" style="margin-top:8px;" value="${esc(sup ? sup.replace(/^92/, "") : "")}"> <button type="button" id="mab-sup-pick" class="mab-mini" style="margin-top:8px;width:100%;padding:10px 12px;font-size:13px;">📇 فون بک سے نمبر تلاش کریں</button> </div> <div id="mab-f-sup-h" class="mab-fhint"></div> </div> <div id="mab-f-err" class="mab-dlg-hint bad" style="display:none;"></div> <div class="mab-dlg-actions" style="margin-top:12px;"> <button id="mab-f-cancel" class="mab-btn mab-btn-cancel">منسوخ</button> <button id="mab-f-send" class="mab-btn mab-btn-ok" disabled>واٹس ایپ بھیجیں ➜</button> </div>`;
    let ov;
    if (host) {
      host.innerHTML = corrHtml;
      ov = host;
    } else {
      ov = openDialog("✏️ ڈیٹا درستی (واٹس ایپ)", corrHtml, {
        noSnd: true,
        scroll: true,
      });
      makeResizable(ov, "mab_corr_geom");
    }
    const closeIt = () => {
      if (host) {
        if (onClose) onClose();
      } else ov.remove();
    };

    const $ = (id) => ov.querySelector("#" + id);
    const shop = $("mab-f-shop"),
      owner = $("mab-f-owner"),
      mob = $("mab-f-mob"),
      addr = $("mab-f-addr"),
      supIn = $("mab-f-sup"),
      supNameIn = $("mab-f-supname");
    const send = $("mab-f-send");
    let editingSup = !haveSup;

    const hint = (id, txt, cls) => {
      const h = $(id + "-h");
      h.textContent = txt || "";
      h.className = "mab-fhint" + (cls ? " " + cls : "");
    };

    // ہجے کا باکس: حروف الگ الگ، آواز میں ہجے، اور درست ہجوں کی تجویز
    const renderSpell = (inp, id) => {
      const box = $(id + "-sp");
      if (!box) return;
      const val = inp.value.trim();
      const latin = val.replace(/[^A-Za-z]/g, "");
      if (!latin) {
        box.style.display = "none";
        box.innerHTML = "";
        return;
      }
      const words = val.split(/\s+/).filter(Boolean);
      const sugg = [];
      words.forEach((w) => {
        const c = w.replace(/[^A-Za-z]/g, "");
        suggestFor(c).forEach((x) => sugg.push({ w, c, x }));
      });
      box.style.display = "block";
      box.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;background:#f1f6ee;border-radius:9px;padding:7px 9px;">' +
        '<div dir="ltr" style="flex:1;font-weight:800;font-size:13px;letter-spacing:1px;color:#33442f;word-break:break-word;">' +
        spellOut(val) +
        "</div>" +
        '<button type="button" class="mab-mini" data-say="1" title="ہجے سنیں">🔊 ہجے</button></div>' +
        (sugg.length
          ? '<div style="margin-top:6px;font-size:12px;font-weight:700;color:#8a4b00;">کیا یہ ہجے درست ہیں؟ تجویز:</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">' +
            sugg
              .map(
                (g, i) =>
                  '<button type="button" class="mab-mini" data-fix="' +
                  i +
                  '" dir="ltr" style="background:#fff4e0;color:#8a4b00;">' +
                  g.w +
                  " ➜ " +
                  g.x +
                  "</button>"
              )
              .join("") +
            "</div>"
          : "");
      box
        .querySelector("[data-say]")
        .addEventListener("click", () =>
          speakUrdu(spellSpeech(val), { force: true })
        );
      box.querySelectorAll("[data-fix]").forEach((b) =>
        b.addEventListener("click", () => {
          const g = sugg[+b.dataset.fix];
          inp.value = inp.value
            .split(/(\s+)/)
            .map((t) => (t === g.w ? g.x : t))
            .join("");
          update();
        })
      );
    };

    const update = () => {
      // owner: صرف انگلش حروف
      const cleanOwner = owner.value
        .replace(/[^A-Za-z .'\-]/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/^\s+/, "");
      const ownerStripped = cleanOwner !== owner.value;
      if (ownerStripped) owner.value = cleanOwner;
      hint(
        "mab-f-owner",
        ownerStripped ? "مالک کا نام صرف انگلش میں لکھا جائے گا" : "",
        "bad"
      );
      renderSpell(shop, "mab-f-shop");
      renderSpell(owner, "mab-f-owner");

      // موبائل: 10 ہندسے 3 سے شروع (92 / 0 خود ہٹ جاتے ہیں)
      let d = mob.value.replace(/\D/g, "");
      if (d.startsWith("0092")) d = d.slice(4);
      else if (d.startsWith("92") && d.length > 10) d = d.slice(2);
      else if (d.startsWith("0")) d = d.slice(1);
      d = d.slice(0, 10);
      const dispMob = d
        ? "0" + d.slice(0, 3) + (d.length > 3 ? "-" + d.slice(3) : "")
        : "";
      if (mob.value !== dispMob) mob.value = dispMob;
      const mobOk = d === "" || /^3\d{9}$/.test(d);
      mob.classList.toggle("bad", d !== "" && !mobOk && d.length === 10);
      hint(
        "mab-f-mob",
        d === ""
          ? ""
          : mobOk
          ? "✔ درست"
          : d[0] !== "3"
          ? "نمبر 3 سے شروع ہونا چاہیے"
          : d.length + " / 10",
        mobOk && d ? "ok" : d.length === 10 || d[0] !== "3" ? "bad" : ""
      );

      const supVal = editingSup
        ? normPkMobile(supIn.value) && supNameIn.value.trim()
          ? normPkMobile(supIn.value)
          : ""
        : sup;
      const anyChange =
        shop.value.trim() || owner.value.trim() || d || (addr && addr.value.trim());
      const ready = anyChange && mobOk && supVal;
      send.disabled = !ready;
      const err = $("mab-f-err");
      if (!anyChange) {
        err.style.display = "none";
      }
      err.style.display = "none";
    };

    [shop, owner, mob, addr, supIn, supNameIn].filter(Boolean).forEach((e) =>
      e.addEventListener("input", update)
    );
    // فیلڈ چھوڑتے ہی: فالتو خالی جگہیں ختم اور ہر لفظ کا پہلا حرف بڑا
    [shop, owner].forEach((e) =>
      e.addEventListener("blur", () => {
        const t = titleCase(e.value);
        if (t !== e.value) {
          e.value = t;
          update();
        }
      })
    );
    // فون بک (Contacts) سے نمبر چننا — صرف Chrome (Android) پر، HTTPS صفحے پر
    $("mab-sup-pick").addEventListener("click", async () => {
      if (!canPickContact()) {
        hint(
          "mab-f-sup",
          "اس براؤزر میں فون بک سرچ دستیاب نہیں، نمبر خود لکھیں",
          "bad"
        );
        return;
      }
      try {
        const res = await navigator.contacts.select(["tel"], {
          multiple: false,
        });
        const tels = res && res[0] && res[0].tel ? res[0].tel : [];
        const num = tels.map(normPkMobile).find(Boolean);
        if (num) {
          supIn.value = num.replace(/^92/, "");
          hint("mab-f-sup", "✔ نمبر چن لیا گیا", "ok");
        } else
          hint(
            "mab-f-sup",
            "اس رابطے میں درست پاکستانی موبائل نمبر نہیں ملا",
            "bad"
          );
        update();
      } catch (e) {}
    });
    $("mab-sup-edit").addEventListener("click", () => {
      editingSup = true;
      $("mab-sup-saved").style.display = "none";
      $("mab-sup-edit-box").style.display = "block";
      supNameIn.focus();
      update();
    });
    $("mab-f-cancel").addEventListener("click", closeIt);
    send.addEventListener("click", () => {
      if (send.disabled) return;
      const supNum = editingSup ? normPkMobile(supIn.value) : sup;
      const supName = editingSup ? supNameIn.value.trim() : supName0;
      if (!supNum || !supName) return;
      setSup(supNum);
      setSupName(supName);
      const nShop = titleCase(shop.value),
        nOwner = titleCase(owner.value),
        nMob = mob.value.replace(/\D/g, "").replace(/^0+/, "");
      // بدلا ہوا فیلڈ: Old کے ساتھ ❌ اور New؛ نہ بدلا ہوا: صرف Old کے ساتھ ✅ (New کی سطر نہیں)
      const now = new Date();
      const dateTxt = now.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const timeTxt = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const lines = [
        "السلام علیکم! سپروائزر " + supName + " بھائی ! اس شاپ کے ڈیٹا میں ",
        "Box Code: " + (box || "—") + "✅",
      ];
      const pair = (oldLabel, newLabel, oldVal, newVal) => {
        if (newVal) {
          lines.push(oldLabel + ": " + (oldVal || "—") + "❌");
          lines.push(newLabel + ": " + newVal);
        } else lines.push(oldLabel + ": " + (oldVal || "—") + "✅");
      };
      pair("Old Shop name", "New Shop name", oShop, nShop);
      pair("Old owner name", "New owner name", oOwner, nOwner);
      pair("Old mobile", "New mobile", oMob, nMob);
      const nAddr = addr ? addr.value.replace(/\s+/g, " ").trim() : "";
      if (hasAddr || nAddr) pair("Old address", "New address", oAddr, nAddr);
      lines.push("");
      lines.push("مطلوبہ تبدیلی فرما کر آگاہ فرما دیجئے📥");
      lines.push("جزاک اللہ خیرا🤲");
      lines.push("");
      lines.push("📅 Date: " + dateTxt);
      lines.push("🕐 Time: " + timeTxt);
      const msg = lines.join("\n");
      closeIt();
      window.open(
        "https://wa.me/" + supNum + "?text=" + encodeURIComponent(msg),
        "_blank"
      );
    });
    update();
  }

  // =============================================================
  // v10.41: ایک ہی پینل — Box Code + دکان/دکاندار/موبائل + رقم
  // lookup(code) → {shop, owner, mobile} یا {error}
  // لوٹاتا ہے: {code, amount} یا null
  // =============================================================
  function askBoxAndAmount(lookup) {
    const LARGE = 10000,
      MAXDIGITS = 7;
    return new Promise((resolve) => {
      const esc = (s) =>
        String(s == null ? "" : s).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            }[c])
        );
      const OK_LABEL = "✔ ٹھیک ہے — Process کریں ➜";
      injectCardStyle(); // تیر کی حرکت (mab-arrow) کا اسٹائل
      if (!document.getElementById("mab-combo-style")) {
        const st = document.createElement("style");
        st.id = "mab-combo-style";
        st.textContent = `
          #mab-dlg-overlay.mab-combo{padding:6px 6px 0;align-items:flex-start;overflow:hidden}
          #mab-dlg-overlay.mab-combo .mab-dlg{max-width:480px;max-height:100%;display:flex;flex-direction:column}
          .mab-combo .mab-dlg-head{padding:6px 10px;font-size:14px;flex-shrink:0}
          .mab-combo .mab-snd{width:30px;height:30px;font-size:14px;border-radius:8px}
          .mab-combo .mab-dlg-body{padding:0;overflow-y:auto;flex:1 1 auto;min-height:0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
          .mab-combo .mab-pad{padding:8px 10px 2px}
          .mab-combo .mab-dlg-label{font-size:11.5px;margin-bottom:3px}
          .mab-combo .mab-dlg-input{font-size:22px;padding:5px 10px;border-radius:10px}
          .mab-combo .mab-dlg-hint{margin-top:2px;font-size:11.5px;min-height:0}
          .mab-combo .mab-dlg-words{margin-top:4px;padding:2px 10px;font-size:14px;min-height:0;line-height:1.5}
          .mab-combo .mab-dlg-warn{margin-top:5px;padding:5px 8px;font-size:12px}
          .mab-combo .mab-chips{gap:5px;margin-top:6px}
          .mab-combo .mab-chip{padding:5px 0;font-size:14px;border-radius:9px}
          .mab-combo .mab-btn{padding:9px 0;font-size:14px;border-radius:11px}
          .mab-combo .mab-sticky-act{position:sticky;bottom:0;z-index:3;margin:0;padding:6px 10px;background:#f6f9f4;border-top:1px solid #dbe6d6}
          @media (max-height:640px){.mab-combo .mab-dlg-input{font-size:19px;padding:4px 8px}.mab-combo .mab-chip{padding:5px 0}}
          .mab-combo .mab-grp{padding:6px 8px;margin-bottom:6px}
          .mab-combo .mab-grp-title{margin-bottom:4px}
          .mab-combo .mab-new{font-size:15px;padding:7px 9px}
          .mab-combo .mab-old{padding:4px 8px;font-size:13px;margin-bottom:4px}
          @media (max-width:340px){.mab-combo #mab-bc-input{width:122px !important;font-size:19px}}
          /* ===== v10.49 پریمیم / ریسپانسیو ===== */
          #mab-dlg-overlay.mab-combo{max-width:100vw;overflow:hidden;padding:max(8px,env(safe-area-inset-top)) 8px 0;background:rgba(6,18,8,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
          #mab-dlg-overlay.mab-combo *{min-width:0;max-width:100%}
          #mab-dlg-overlay.mab-combo .mab-dlg{width:100%;max-width:480px;border:0;border-radius:20px;background:#f4f8f1;box-shadow:0 22px 50px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.10)}
          .mab-combo .mab-dlg-head{padding:9px 12px;gap:8px;flex-wrap:nowrap;background:linear-gradient(135deg,#093510 0%,#1d5a1d 55%,#3d7b2b 100%);box-shadow:0 2px 10px rgba(0,0,0,.22)}
          .mab-combo .mab-dlg-head>span{flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px;letter-spacing:.2px}
          .mab-combo .mab-snd{flex:0 0 auto;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
          .mab-combo .mab-snd+.mab-snd{margin-inline-start:6px}
          .mab-combo .mab-pad{padding:10px 12px 8px}
          .mab-combo #mab-bc-input{border-radius:12px;font-size:22px;box-shadow:0 1px 3px rgba(20,60,20,.12)}
          .mab-combo #mab-info{background:#fff !important;border:0 !important;border-radius:14px !important;padding:2px 12px !important;box-shadow:0 2px 10px rgba(30,70,30,.12),0 0 0 1.5px #cfe0c8}
          .mab-combo .mab-dlg-input{border-width:1.5px;border-radius:12px;box-shadow:0 1px 3px rgba(20,60,20,.10)}
          .mab-combo .mab-dlg-input:focus{border-color:#2e7d32;box-shadow:0 0 0 3px rgba(46,125,50,.18)}
          .mab-combo .mab-dlg-words{background:#fff;border:1px dashed #a9c8a0;border-radius:12px;color:#256b24}
          .mab-combo .mab-chips{display:grid !important;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:8px}
          .mab-combo .mab-chip{flex:none;padding:7px 0;font-size:14px;border-radius:11px;border:1.5px solid #3b7a2a;background:linear-gradient(180deg,#fff,#eef5ea);box-shadow:0 1px 2px rgba(0,0,0,.08);transition:transform .08s}
          .mab-combo .mab-chip:active{transform:scale(.95);background:#dcecd6}
          .mab-combo .mab-btn{transition:transform .08s,filter .15s}
          .mab-combo .mab-btn:active:not(:disabled){transform:scale(.97);filter:brightness(.95)}
          .mab-combo .mab-btn-ok{background:linear-gradient(135deg,#276b1c,#4a9029);box-shadow:0 3px 8px rgba(30,90,30,.35)}
          .mab-combo .mab-btn-ok:disabled{background:#b9c7b4;box-shadow:none}
          .mab-combo #mab-chk-hint{border-radius:12px !important}
          .mab-combo #mab-chk-hint .mab-dlg-actions{display:flex;flex-direction:row;gap:6px;margin-top:6px}
          .mab-combo #mab-chk-hint .mab-btn-cancel{flex:0 0 30%}
          .mab-combo #mab-chk-hint .mab-btn-ok{flex:1 1 auto;white-space:normal;line-height:1.35}
          .mab-combo .mab-state{font-size:13px;font-weight:700;padding:8px 2px;line-height:1.6;text-align:right}
          .mab-combo .mab-state-load{color:#8a4b00}
          .mab-combo .mab-state-err{color:#c62828}
          @media (max-width:360px){.mab-combo .mab-chip{font-size:13px;padding:6px 0}.mab-combo .mab-dlg-head>span{font-size:13.5px}}`;
        document.head.appendChild(st);
      }
      const ov = openDialog(
        '📦 Box Code / رقم',
        ` <div class="mab-pad"><span id="mab-bc-count" style="display:none"></span><div class="mab-toprow" style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center;"><input id="mab-bc-input" class="mab-dlg-input" type="text" inputmode="email" lang="en" dir="ltr" enterkeyhint="next" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" style="text-transform:uppercase;letter-spacing:3px;text-align:center;width:132px;"><div id="mab-top-mob" style="min-width:0;"></div></div>
        <div id="mab-bc-hint" class="mab-dlg-hint" style="display:none;"></div>
        <div id="mab-info" style="display:none;margin-top:6px;background:#fff;border:1.5px solid #2f6b1f;border-radius:10px;padding:2px 10px;"></div>
        <div id="mab-corr-host" style="display:none;margin-top:6px;"></div>
        <span id="mab-am-fmt" style="display:none"></span>
        <input id="mab-am-input" class="mab-dlg-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${MAXDIGITS}" autocomplete="off" placeholder="یہاں رقم لکھیں" style="text-align:center;margin-top:8px;">
        <div id="mab-am-hint" class="mab-dlg-hint">صرف اعداد، 0 سے زیادہ</div>
        <div id="mab-am-words" class="mab-dlg-words" dir="rtl">—</div>
        <div id="mab-am-warn" class="mab-dlg-warn" style="display:none;">⚠️ بڑی رقم ہے، ایک بار پھر چیک کر لیں</div>
        <div class="mab-chips">${[100, 150, 200, 250, 300, 500]
          .map(
            (v) =>
              `<button type="button" class="mab-chip" data-v="${v}">${v}</button>`
          )
          .join("")}</div>
        <div id="mab-chk-hint" dir="rtl" style="margin-top:8px;border:1.5px dashed transparent;border-radius:10px;padding:4px 8px;"><div id="mab-chk-txt" style="display:none;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;color:#5a3d00;line-height:1.5;"><span>ریکارڈ چیک کر کے تسلی کریں، پھر نیچے <b style="color:#2f6b1f;">Process</b> دبائیں</span><svg class="mab-arrow" width="18" height="24" viewBox="0 0 24 28" fill="none" stroke="#2f6b1f" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 2v20"/><path d="M4 15l8 9 8-9"/></svg></div>
          <div class="mab-dlg-actions" dir="rtl" style="margin-top:5px;gap:6px;">
            <button id="mab-main-cancel" class="mab-btn mab-btn-cancel" style="padding:5px 0;font-size:12px;
