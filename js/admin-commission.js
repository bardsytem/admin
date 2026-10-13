(function () {
  // Same options as the public Commission page
  const CATEGORIES = {
    mural: { label: "Mural", base: 5000, materials: 1000, hasScale: true },
    canvas: {
      label: "Canvas Piece",
      base: 2000,
      materials: 500,
      hasScale: false,
    },
    vehicle: {
      label: "Vehicle Mural",
      base: 3000,
      materials: 1000,
      hasScale: true,
    },
    others: { label: "Others", base: 5000, materials: 1000, hasScale: true },
  };

  const SCALES = {
    small: { label: "Wall (1-8ft)", fee: 5000 },
    medium: { label: "Medium (8-16ft)", fee: 10000 },
    large: { label: "Monumental (20ft+)", fee: 20000 },
  };

  // Canvas pieces have no scale, so they are saved under this name
  const NO_SCALE = "none";

  let category = "mural";
  let scale = "small";
  let saved = {}; // prices loaded from Supabase, keyed "category|scale"

  const el = {
    state: document.getElementById("pricing-state"),
    panel: document.getElementById("pricing-panel"),
    total: document.getElementById("estimate-total"),
    unsaved: document.getElementById("unsaved"),
    hint: document.getElementById("scale-hint"),
    categoryOptions: document.getElementById("category-options"),
    scaleOptions: document.getElementById("scale-options"),
    base: document.getElementById("price-base"),
    scaleFee: document.getElementById("price-scale"),
    materials: document.getElementById("price-coat"),
    saveBtn: document.getElementById("save-rates"),
    toast: document.getElementById("toast"),
  };

  // ---------- Helpers ----------
  function toast(message, isError) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className = isError ? "toast show error" : "toast show";
    clearTimeout(el.toast._timer);
    el.toast._timer = setTimeout(() => {
      el.toast.className = "toast";
    }, 3000);
  }

  function money(value) {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  function setUnsaved(isDirty) {
    el.unsaved.textContent = isDirty ? "Unsaved changes" : "";
  }

  function activeScaleKey() {
    return CATEGORIES[category].hasScale ? scale : NO_SCALE;
  }

  // Saved prices if they exist, otherwise the default starting prices
  function currentPrices() {
    const found = saved[`${category}|${activeScaleKey()}`];
    if (found) return found;

    const cat = CATEGORIES[category];
    return {
      base: cat.base,
      scaleFee: cat.hasScale ? SCALES[scale].fee : 0,
      materials: cat.materials,
    };
  }

  // ---------- Screen ----------
  function updateTotal() {
    const total =
      Number(el.base.value || 0) +
      Number(el.scaleFee.value || 0) +
      Number(el.materials.value || 0);
    el.total.textContent = money(total);
  }

  function fillInputs() {
    const prices = currentPrices();
    const hasScale = CATEGORIES[category].hasScale;

    el.base.value = prices.base;
    el.scaleFee.value = prices.scaleFee;
    el.materials.value = prices.materials;
    // Canvas pieces have one merged price, so hide the second field
    // and rename the first one to match the public page
    el.scaleFee.closest(".form-row").hidden = !hasScale;
    document.querySelector('label[for="price-base"]').textContent = hasScale
      ? "Base Price"
      : "Commission & Base Price";
    if (!hasScale) el.scaleFee.value = 0;

    el.hint.textContent = hasScale
      ? `Editing: ${CATEGORIES[category].label} / ${SCALES[scale].label}`
      : "Canvas pieces have no scale. Commission and base price are one amount.";

    updateTotal();
    setUnsaved(false);
  }

  function renderOptions() {
    el.categoryOptions.innerHTML = "";
    Object.keys(CATEGORIES).forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = CATEGORIES[key].label;
      btn.className = key === category ? "btn btn-solid" : "btn btn-outline";
      btn.style.margin = "0 8px 8px 0";
      btn.addEventListener("click", () => {
        category = key;
        renderOptions();
        fillInputs();
      });
      el.categoryOptions.appendChild(btn);
    });

    el.scaleOptions.innerHTML = "";
    if (!CATEGORIES[category].hasScale) return;

    Object.keys(SCALES).forEach((key) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = SCALES[key].label;
      btn.className = key === scale ? "btn btn-solid" : "btn btn-outline";
      btn.style.margin = "0 8px 8px 0";
      btn.addEventListener("click", () => {
        scale = key;
        renderOptions();
        fillInputs();
      });
      el.scaleOptions.appendChild(btn);
    });
  }

  // ---------- Supabase ----------
  async function loadPricing() {
    const { data, error } = await supabaseClient.from("pricing").select("*");

    if (error) {
      console.error(error);
      el.state.textContent = "Could not load prices.";
      return;
    }

    data.forEach((row) => {
      saved[`${row.category}|${row.scale}`] = {
        base: Number(row.base),
        scaleFee: Number(row.scale_fee),
        materials: Number(row.materials),
      };
    });

    el.state.textContent = "";
    el.panel.hidden = false;
    renderOptions();
    fillInputs();
  }

  async function savePricing() {
    const prices = {
      base: Number(el.base.value || 0),
      scaleFee: CATEGORIES[category].hasScale
        ? Number(el.scaleFee.value || 0)
        : 0,
      materials: Number(el.materials.value || 0),
    };

    if (prices.base < 0 || prices.scaleFee < 0 || prices.materials < 0) {
      toast("Prices can't be negative.", true);
      return;
    }

    el.saveBtn.disabled = true;

    const { error } = await supabaseClient.from("pricing").upsert(
      {
        category,
        scale: activeScaleKey(),
        base: prices.base,
        scale_fee: prices.scaleFee,
        materials: prices.materials,
      },
      { onConflict: "category,scale" },
    );

    el.saveBtn.disabled = false;

    if (error) {
      console.error(error);
      toast("Could not save the prices.", true);
      return;
    }

    saved[`${category}|${activeScaleKey()}`] = prices;
    setUnsaved(false);
    toast("Prices updated.");
  }

  // ---------- Events ----------
  function cleanNumber(input) {
    let v = input.value.replace(/[^0-9.]/g, "");
    const firstDot = v.indexOf(".");
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    }
    v = v.replace(/(\.\d{2}).*$/, "$1");
    if (v !== input.value) input.value = v;
  }

  [el.base, el.scaleFee, el.materials].forEach((input) => {
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";

    input.addEventListener("input", () => {
      cleanNumber(input);
      updateTotal();
      setUnsaved(true);
    });
  });

  el.saveBtn.addEventListener("click", savePricing);

  loadPricing();
})();
