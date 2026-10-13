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

  let canvasPieces = []; // canvas artworks from the gallery
  let canvasPrices = {}; // each artwork's own prices, keyed by artwork id
  let canvasPick = "default"; // "default" or the id of the picked artwork

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
    scaleRow: document.getElementById("scale-row"),
    canvasBlock: document.getElementById("canvas-block"),
    canvasState: document.getElementById("canvas-state"),
    canvasPanel: document.getElementById("canvas-panel"),
    canvasSelect: document.getElementById("canvas-select"),
    canvasImg: document.getElementById("canvas-img"),
    canvasReset: document.getElementById("canvas-reset"),
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

  // The default prices: saved ones if they exist, otherwise the starting prices
  function defaultPrices() {
    const found = saved[`${category}|${activeScaleKey()}`];
    if (found) return found;

    const cat = CATEGORIES[category];
    return {
      base: cat.base,
      scaleFee: cat.hasScale ? SCALES[scale].fee : 0,
      materials: cat.materials,
    };
  }

  // The prices shown in the boxes: a canvas artwork's own prices, or the defaults
  function currentPrices() {
    const defaults = defaultPrices();

    if (category === "canvas" && canvasPick !== "default") {
      const own = canvasPrices[canvasPick];
      if (own) {
        return {
          base: own.base,
          scaleFee: 0,
          materials: own.materials ?? defaults.materials,
        };
      }
    }
    return defaults;
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

    // Canvas pieces show the artwork picker instead of the scale buttons
    if (el.scaleRow) el.scaleRow.hidden = !hasScale;
    if (el.canvasBlock) el.canvasBlock.hidden = hasScale;

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
      : canvasHint();

    updateCanvasBlock();

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

    let error;

    if (category === "canvas" && canvasPick !== "default") {
      // Save the prices for the picked canvas artwork only
      const result = await supabaseClient.from("canvas_prices").upsert({
        item_id: Number(canvasPick),
        price: prices.base,
        materials: prices.materials,
      });
      error = result.error;

      if (!error) {
        canvasPrices[canvasPick] = {
          base: prices.base,
          materials: prices.materials,
        };
      }
    } else {
      // Save the default prices for the picked category
      const result = await supabaseClient.from("pricing").upsert(
        {
          category,
          scale: activeScaleKey(),
          base: prices.base,
          scale_fee: prices.scaleFee,
          materials: prices.materials,
        },
        { onConflict: "category,scale" },
      );
      error = result.error;

      if (!error) saved[`${category}|${activeScaleKey()}`] = prices;
    }

    el.saveBtn.disabled = false;

    if (error) {
      console.error(error);
      toast("Could not save the prices.", true);
      return;
    }

    renderCanvasSelect(); // refresh the "custom price" labels
    fillInputs();
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

  // ---------- Canvas artworks ----------
  // Makes text safe to place inside HTML
  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML.replace(/"/g, "&quot;");
  }

  // Old images are saved like "assets/x.png", this page is inside /html
  function imgSrc(url) {
    if (!url) return "";
    return url.startsWith("http") ? url : "../" + url;
  }

  function pickedPiece() {
    return canvasPieces.find((p) => String(p.id) === canvasPick);
  }

  // Fill the dropdown. "default" is first, then every canvas artwork
  function renderCanvasSelect() {
    let html = `<option value="default">All canvas pieces (default price)</option>`;

    canvasPieces.forEach((piece) => {
      const priceText = canvasPrices[piece.id]
        ? "custom price"
        : "default price";
      let note = "";
      if (piece.is_sold) note = " (Sold)";
      if (piece.not_for_sale) note = " (Not for sale)";
      html += `<option value="${piece.id}">${esc(piece.title)}${note} - ${priceText}</option>`;
    });

    el.canvasSelect.innerHTML = html;
    el.canvasSelect.value = canvasPick;
  }

  // Text under the buttons that explains what is being edited
  function canvasHint() {
    const piece = pickedPiece();

    if (!piece) {
      return "Editing the default price for every canvas piece that has no price of its own.";
    }
    if (canvasPrices[piece.id]) {
      return `Editing the price for "${piece.title}".`;
    }
    return `"${piece.title}" uses the default price. Change the numbers and click Update Rates to give it its own price.`;
  }

  // Show the artwork image and the "Use default price" button when needed
  function updateCanvasBlock() {
    if (!el.canvasImg || !el.canvasReset) return; // picker missing from the HTML

    const piece = pickedPiece();

    el.canvasImg.hidden = !piece;
    if (piece) el.canvasImg.src = imgSrc(piece.image_url);

    el.canvasReset.hidden = !(piece && canvasPrices[piece.id]);
  }

  async function loadCanvasPieces() {
    // 1. Every canvas artwork in the gallery (A to Z)
    const piecesResult = await supabaseClient
      .from("gallery_items")
      .select("id, title, image_url, is_sold, not_for_sale")
      .eq("category", "canvas")
      .order("title", { ascending: true });

    // 2. The artworks that already have their own price
    const pricesResult = await supabaseClient
      .from("canvas_prices")
      .select("item_id, price, materials");

    if (piecesResult.error || pricesResult.error) {
      console.error(piecesResult.error || pricesResult.error);
      el.canvasState.textContent = "Could not load canvas pieces.";
      return;
    }

    canvasPieces = piecesResult.data;

    canvasPrices = {};
    pricesResult.data.forEach((row) => {
      canvasPrices[row.item_id] = {
        base: Number(row.price),
        materials: row.materials === null ? null : Number(row.materials),
      };
    });

    if (canvasPieces.length === 0) {
      el.canvasState.textContent = "No canvas pieces in the gallery yet.";
      return;
    }

    el.canvasState.textContent = "";
    el.canvasPanel.hidden = false;
    renderCanvasSelect();
    updateCanvasBlock();
  }

  // Remove an artwork's own price so it goes back to the default
  async function useDefaultCanvasPrice() {
    const { error } = await supabaseClient
      .from("canvas_prices")
      .delete()
      .eq("item_id", Number(canvasPick));

    if (error) {
      console.error(error);
      toast("Could not remove the custom price.", true);
      return;
    }

    delete canvasPrices[canvasPick];
    renderCanvasSelect();
    fillInputs();
    toast("This artwork now uses the default price.");
  }

  // Only set up the artwork picker if admin-commission.html has it
  if (el.canvasSelect && el.canvasReset) {
    el.canvasSelect.addEventListener("change", () => {
      canvasPick = el.canvasSelect.value;
      fillInputs();
    });
    el.canvasReset.addEventListener("click", useDefaultCanvasPrice);

    loadCanvasPieces();
  }

  // ---------- Client commission requests ----------
  const MAX_VISIBLE = 5; // show this many rows, then scroll

  let requests = [];
  let requestsSort = "recent";
  let requestsFilter = "pending"; // "pending" | "confirmed" | "all"

  const cr = {
    state: document.getElementById("cr-state"),
    wrap: document.getElementById("cr-wrap"),
    body: document.getElementById("cr-body"),
    sort: document.getElementById("cr-sort"),
    tabs: document.querySelectorAll("#cr-tabs .tab"),
  };

  function isConfirmed(r) {
    return r.status === "confirmed";
  }

  function findRequest(id) {
    return requests.find((r) => String(r.id) === String(id));
  }

  function receivedText(r) {
    const d = new Date(r.created_at);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-PH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  // estimated_cost is saved as text like "2,400.00"
  function costText(r) {
    const value = String(r.estimated_cost ?? "").trim();
    return value ? "\u20B1" + value : "";
  }

  function sortedRequests() {
    let list = [...requests];

    if (requestsFilter === "pending")
      list = list.filter((r) => !isConfirmed(r));
    if (requestsFilter === "confirmed") list = list.filter(isConfirmed);

    list.sort((a, b) =>
      requestsSort === "oldest"
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b.created_at) - new Date(a.created_at),
    );
    return list;
  }

  function updateRequestTabs() {
    const confirmed = requests.filter(isConfirmed).length;
    const labels = {
      pending: `To be confirmed (${requests.length - confirmed})`,
      confirmed: `Confirmed (${confirmed})`,
      all: `All (${requests.length})`,
    };
    cr.tabs.forEach((tab) => {
      tab.textContent = labels[tab.dataset.filter];
      tab.classList.toggle("is-active", tab.dataset.filter === requestsFilter);
    });
  }

  // Limits the table to the height of its first rows, then it scrolls
  function limitRequestsTable() {
    const rows = cr.body.querySelectorAll("tr");
    if (rows.length <= MAX_VISIBLE) {
      cr.wrap.style.maxHeight = "";
      return;
    }
    let height = cr.wrap.querySelector("thead").offsetHeight + 2;
    for (let i = 0; i < MAX_VISIBLE; i++) height += rows[i].offsetHeight;
    cr.wrap.style.maxHeight = height + "px";
  }

  function renderRequests() {
    updateRequestTabs();
    const list = sortedRequests();

    if (!list.length) {
      cr.state.textContent = !requests.length
        ? "No commission requests yet."
        : requestsFilter === "confirmed"
          ? "No confirmed requests yet."
          : "Nothing waiting to be confirmed.";
      cr.wrap.hidden = true;
      return;
    }

    cr.state.textContent = "";
    cr.wrap.hidden = false;
    cr.body.innerHTML = list
      .map(
        (r) => `
          <tr>
            <td>${esc(receivedText(r))}</td>
            <td>
              ${esc(r.client_name)}<br />
              <a href="mailto:${esc(r.client_email)}">${esc(r.client_email)}</a>
              ${r.client_phone ? `<br />${esc(r.client_phone)}` : ""}
              ${r.address ? `<span class="cell-sub">${esc(r.address)}</span>` : ""}
            </td>
            <td>
              ${esc(r.artwork_category)}
              ${r.artwork_scale ? `<span class="cell-sub">${esc(r.artwork_scale)}</span>` : ""}
            </td>
            <td class="cost-cell">${esc(costText(r))}</td>
            <td class="details-cell">${esc(r.details)}</td>
            <td>
              <div class="row-actions">
                ${
                  isConfirmed(r)
                    ? `<span class="status-pill">Confirmed</span>`
                    : `<button type="button" class="btn-confirm" data-act="confirm" data-id="${r.id}">Confirm</button>`
                }
                <button type="button" class="btn-link" data-act="cancel" data-id="${r.id}">Cancel</button>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");

    limitRequestsTable();
  }

  async function loadRequests() {
    const { data, error } = await supabaseClient
      .from("commissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      cr.state.textContent = "Could not load commission requests.";
      cr.wrap.hidden = true;
      return;
    }

    requests = data;
    renderRequests();
  }

  function sendRequestEmail(r) {
    if (typeof EMAILJS_COMMISSION_CONFIRM_TEMPLATE_ID === "undefined") {
      return Promise.reject(
        new Error(
          "EMAILJS_COMMISSION_CONFIRM_TEMPLATE_ID is missing in config.js",
        ),
      );
    }
    return emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_COMMISSION_CONFIRM_TEMPLATE_ID,
      {
        to_email: r.client_email,
        to_name: r.client_name,
        subject: "Your commission request has been confirmed",
        message:
          "Your commission request has been confirmed. Bard will contact you within 24 hours.",
        artwork_category: r.artwork_category || "",
        artwork_scale: r.artwork_scale || "",
        estimated_cost: costText(r),
      },
    );
  }

  async function confirmRequest(id, btn) {
    const r = findRequest(id);
    if (!r) return;
    if (!confirm(`Confirm this request and email ${r.client_email}?`)) return;

    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      await sendRequestEmail(r);
    } catch (err) {
      console.error("EmailJS error:", err);
      const reason =
        err && (err.text || err.message)
          ? ` (${err.status || ""} ${err.text || err.message})`
          : "";
      toast(
        "Could not send the email" + reason + ". Request was not confirmed.",
        true,
      );
      btn.disabled = false;
      btn.textContent = "Confirm";
      return;
    }

    const { error } = await supabaseClient
      .from("commissions")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error(error);
      toast("Email sent, but could not save the status.", true);
      btn.disabled = false;
      btn.textContent = "Confirm";
      return;
    }

    toast("Request confirmed and client notified.");
    loadRequests();
  }

  async function cancelRequest(id) {
    if (!confirm("Remove this commission request? This can't be undone."))
      return;

    const { error } = await supabaseClient
      .from("commissions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(error);
      toast("Could not remove the request.", true);
      return;
    }

    toast("Request removed.");
    loadRequests();
  }

  cr.sort.addEventListener("change", (e) => {
    requestsSort = e.target.value;
    renderRequests();
  });

  cr.tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      requestsFilter = tab.dataset.filter;
      renderRequests();
    }),
  );

  cr.body.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "confirm") confirmRequest(btn.dataset.id, btn);
    if (btn.dataset.act === "cancel") cancelRequest(btn.dataset.id);
  });

  window.addEventListener("resize", limitRequestsTable);

  loadRequests();

  loadPricing();
})();
