// ===================== Settings =====================
const BUCKET = "gallery"; // Supabase Storage bucket for photos
const MAX_SIZE = 35 * 1024 * 1024; // 35MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CATEGORY_NAMES = { mural: "Mural", canvas: "Canvas", others: "Others" };

// ===================== Data kept while the page is open =====================
let items = [];
let filterCategory = "all";
let filterSearch = "";
let filterStatus = "all";
let sortOrder = "newest";

let editingId = null;
let newImageFile = null;
let newPortraitFile = null;
let portraitUrl = null;

let canvasPrices = {};
let pricesLoaded = false;

// Profile column name -> input id
const PROFILE_FIELDS = {
  headline: "p-headline",
  tagline: "p-tagline",
  story: "p-story",
  stat1_num: "p-stat1-num",
  stat1_label: "p-stat1-label",
  stat2_num: "p-stat2-num",
  stat2_label: "p-stat2-label",
  stat3_num: "p-stat3-num",
  stat3_label: "p-stat3-label",
  signature_name: "p-signature",
  location_tag: "p-location",
  contact_name: "p-contact-name",
  contact_phone: "p-contact-phone",
  contact_facebook: "p-contact-fb",
};

// ===================== Small helpers =====================
function $(id) {
  return document.getElementById(id);
}

// Makes text safe to place inside HTML
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML.replace(/"/g, "&quot;");
}

function imgSrc(url) {
  if (!url) return "";
  return url.startsWith("http") ? url : "../" + url;
}

// Small message at the bottom of the screen
function toast(text, isError) {
  const box = $("toast");
  box.textContent = text;
  box.className = isError ? "toast show error" : "toast show";
  setTimeout(() => (box.className = "toast"), 3500);
}

// Returns true if the file is an allowed image
function isGoodImage(file) {
  if (!IMAGE_TYPES.includes(file.type)) {
    toast("Please use a PNG, JPG or WEBP image.", true);
    return false;
  }
  if (file.size > MAX_SIZE) {
    toast("Image is too large (max 35MB).", true);
    return false;
  }
  return true;
}

function updateCount(textareaId, countId) {
  $(countId).textContent = $(textareaId).value.length + " characters";
}

// Upload a photo to Supabase Storage and return its public link
async function uploadImage(file) {
  const fileName =
    Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(fileName, file);
  if (error) throw error;

  const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(fileName);
  return data.publicUrl;
}

// Delete a photo from Supabase Storage (old assets/ images are skipped)
async function deleteImage(url) {
  if (!url || !url.startsWith("http") || !url.includes("/" + BUCKET + "/")) {
    return;
  }
  const fileName = decodeURIComponent(url.split("/" + BUCKET + "/").pop());
  await supabaseClient.storage.from(BUCKET).remove([fileName]);
}

// ===================== Login check + logout =====================
async function checkLogin() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = "admin-login.html";
    return false;
  }
  document.body.classList.remove("is-checking");
  return true;
}

$("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "admin-login.html";
});

// ===================== Studio profile =====================
function showPortrait(src) {
  $("portrait-img").hidden = !src;
  $("portrait-empty").hidden = !!src;
  if (src) $("portrait-img").src = src;
}

// Shows "Synced" or "Unsaved changes"
function setBadge(unsaved) {
  $("sync-badge").textContent = unsaved ? "Unsaved changes" : "Synced";
  $("sync-badge").classList.toggle("is-dirty", unsaved);
}

async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("site_profile")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    toast("Could not load profile: " + error.message, true);
    return;
  }
  if (!data) return;

  for (const column in PROFILE_FIELDS) {
    $(PROFILE_FIELDS[column]).value = data[column] ?? "";
  }
  $("p-commissions").checked = data.open_for_commissions;
  portraitUrl = data.portrait_url;
  showPortrait(imgSrc(portraitUrl));
  updateCount("p-story", "story-count");
  setBadge(false);
}

async function saveProfile() {
  const button = $("save-profile");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const oldPortraitUrl = portraitUrl;
    let newPortraitUrl = portraitUrl;

    if (newPortraitFile) {
      newPortraitUrl = await uploadImage(newPortraitFile);
    }

    const row = {
      id: 1,
      open_for_commissions: $("p-commissions").checked,
      portrait_url: newPortraitUrl,
      updated_at: new Date().toISOString(),
    };
    for (const column in PROFILE_FIELDS) {
      row[column] = $(PROFILE_FIELDS[column]).value.trim();
    }

    // Add https:// if the Facebook link was typed without it
    if (row.contact_facebook && !/^https?:\/\//i.test(row.contact_facebook)) {
      row.contact_facebook = "https://" + row.contact_facebook;
    }

    const { error } = await supabaseClient.from("site_profile").upsert(row);
    if (error) throw error;

    // Saved. Remove the replaced portrait from storage
    if (newPortraitFile) deleteImage(oldPortraitUrl);
    portraitUrl = newPortraitUrl;
    newPortraitFile = null;

    setBadge(false);
    toast("Profile saved.");
  } catch (err) {
    console.error(err);
    toast("Could not save profile: " + err.message, true);
  }

  button.disabled = false;
  button.textContent = "Save Profile Section";
}

function setupProfile() {
  $("save-profile").addEventListener("click", saveProfile);

  // Typing anywhere in the profile marks it as unsaved
  $("profile-grid").addEventListener("input", () => setBadge(true));
  $("p-story").addEventListener("input", () =>
    updateCount("p-story", "story-count"),
  );

  // Click the portrait box to pick a photo
  $("portrait-box").addEventListener("click", () => $("portrait-file").click());
  $("portrait-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !isGoodImage(file)) return;

    newPortraitFile = file;
    showPortrait(URL.createObjectURL(file));
    setBadge(true);
  });
}

// ===================== Gallery grid =====================
async function loadGallery() {
  const { data, error } = await supabaseClient
    .from("gallery_items")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    $("gallery-state").textContent =
      "Could not load artworks: " + error.message;
    return;
  }
  items = data;

  // Prices of canvas artworks, shown in the Edit popup
  const pricesResult = await supabaseClient
    .from("canvas_prices")
    .select("item_id, price");

  if (pricesResult.error) {
    console.error("Could not load canvas prices:", pricesResult.error);
    pricesLoaded = false;
  } else {
    canvasPrices = {};
    pricesResult.data.forEach((row) => {
      canvasPrices[row.item_id] = row.price;
    });
    pricesLoaded = true;
  }

  renderGallery();
}

// Apply the tab, search box and status filter
function getVisibleItems() {
  const search = filterSearch.trim().toLowerCase();

  const list = items.filter((item) => {
    if (filterCategory !== "all" && item.category !== filterCategory) {
      return false;
    }
    if (filterStatus === "public" && !item.is_visible) return false;
    if (filterStatus === "hidden" && item.is_visible) return false;

    const text = (
      item.title +
      " " +
      (item.location || "") +
      " " +
      (item.year || "")
    ).toLowerCase();
    return text.includes(search);
  });

  // Higher id = uploaded more recently
  return list.sort((a, b) =>
    sortOrder === "oldest" ? a.id - b.id : b.id - a.id,
  );
}

function makeCard(item) {
  const meta = [
    item.location,
    item.dimensions,
    CATEGORY_NAMES[item.category] || item.category,
  ]
    .filter(Boolean)
    .join(" • ");

  let leftBadges = "";
  if (item.is_featured)
    leftBadges += '<span class="badge featured">★ Featured</span>';
  if (item.is_sold) leftBadges += '<span class="badge">Sold</span>';
  if (item.not_for_sale)
    leftBadges += '<span class="badge">Not for sale</span>';

  const statusBadge = item.is_visible
    ? '<span class="badge public">● Public</span>'
    : '<span class="badge hidden-tag">Hidden / Draft</span>';

  return `
    <article class="art-card">
      <div class="art-thumb">
        <img src="${esc(imgSrc(item.image_url))}" alt="${esc(item.title)}" loading="lazy" />
        <div class="badges">
          <div class="badge-group">${leftBadges}</div>
          ${statusBadge}
        </div>
      </div>
      <div class="art-info">
        <h3>${esc(item.title)}</h3>
        <p>${esc(meta)}</p>
      </div>
      <div class="art-actions">
        <button type="button" class="edit-btn" data-action="edit" data-id="${item.id}">Edit</button>
        <button type="button" class="del-btn" data-action="delete" data-id="${item.id}" aria-label="Delete">&#128465;</button>
      </div>
    </article>`;
}

function renderGallery() {
  // Tab labels with counts
  const murals = items.filter((i) => i.category === "mural").length;
  const canvas = items.filter((i) => i.category === "canvas").length;
  const others = items.filter((i) => i.category === "others").length;
  const tabNames = {
    all: "All (" + items.length + ")",
    mural: "Murals (" + murals + ")",
    canvas: "Canvas (" + canvas + ")",
    others: "Others (" + others + ")",
  };
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.textContent = tabNames[tab.dataset.filter];
    tab.classList.toggle("is-active", tab.dataset.filter === filterCategory);
  });

  // Cards + the "Add Photo" tile at the end
  const visible = getVisibleItems();
  const addTile = `
    <button type="button" class="add-tile" data-action="add">
      <strong>+ Add Photo</strong>
      <span>Add new art work</span>
    </button>`;
  $("art-grid").innerHTML = visible.map(makeCard).join("") + addTile;

  // Empty messages
  const state = $("gallery-state");
  if (items.length === 0) {
    state.textContent = "No artworks yet. Click “Add Artwork” to upload one.";
  } else if (visible.length === 0) {
    state.textContent = "No artworks match your filters.";
  }
  state.hidden = visible.length > 0;
}

function setupGallery() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      filterCategory = tab.dataset.filter;
      renderGallery();
    });
  });

  $("search").addEventListener("input", (e) => {
    filterSearch = e.target.value;
    renderGallery();
  });

  $("status-filter").addEventListener("change", (e) => {
    filterStatus = e.target.value;
    renderGallery();
  });

  $("sort-order").addEventListener("change", (e) => {
    sortOrder = e.target.value;
    renderGallery();
  });

  // One listener handles every Edit / Delete / Add button in the grid
  $("art-grid").addEventListener("click", (e) => {
    const button = e.target.closest("[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    if (button.dataset.action === "add") openModal(null);
    if (button.dataset.action === "edit") openModal(id);
    if (button.dataset.action === "delete") deleteArtwork(id);
  });

  $("add-artwork").addEventListener("click", () => openModal(null));
}

// ===================== Edit / Add popup =====================

function updateSaleBlock() {
  const isCanvas = $("a-category").value === "canvas";
  $("sale-block").hidden = !isCanvas;
  $("a-price").disabled = $("a-notforsale").checked;
}

// Save or remove the price of a canvas artwork
async function savePrice(itemId, row) {
  if (!pricesLoaded) return;

  const price = $("a-price").value.trim();
  const hasPrice =
    row.category === "canvas" && !row.not_for_sale && price !== "";

  let result;
  if (hasPrice) {
    // Only the base price is saved here. The materials price stays as it is
    result = await supabaseClient
      .from("canvas_prices")
      .upsert({ item_id: itemId, price: Number(price) });
  } else {
    result = await supabaseClient
      .from("canvas_prices")
      .delete()
      .eq("item_id", itemId);
  }

  if (result.error) throw result.error;
}

function showPreview(src) {
  $("preview-img").hidden = !src;
  if (src) $("preview-img").src = src;
}

function openModal(id) {
  editingId = id;
  newImageFile = null;
  $("a-file").value = "";

  const item = items.find((i) => i.id === id);

  $("modal-title").textContent = item ? "Edit Artwork" : "Add Artwork";
  $("modal-pill").textContent = item ? item.title : "";
  $("modal-delete").hidden = !item;

  $("a-title").value = item ? item.title : "";
  $("a-category").value = item ? item.category : "mural";
  $("a-year").value = item?.year ?? "";
  $("a-dimensions").value = item?.dimensions ?? "";
  $("a-location").value = item?.location ?? "";
  $("a-desc").value = item?.description ?? "";
  $("a-visible").checked = item ? item.is_visible : true;
  $("a-featured").checked = item ? item.is_featured : false;
  $("a-sold").checked = item ? item.is_sold : false;
  $("a-price").value =
    item && canvasPrices[item.id] !== undefined ? canvasPrices[item.id] : "";
  $("a-notforsale").checked = item ? !!item.not_for_sale : false;
  updateSaleBlock();
  updateCount("a-desc", "a-count");
  showPreview(item ? imgSrc(item.image_url) : "");

  $("modal").hidden = false;
  document.body.style.overflow = "hidden";
  $("a-title").focus();
}

function closeModal() {
  $("modal").hidden = true;
  document.body.style.overflow = "";
  editingId = null;
  newImageFile = null;
}

function pickArtworkImage(file) {
  if (!file || !isGoodImage(file)) return;
  newImageFile = file;
  showPreview(URL.createObjectURL(file));
}

async function saveArtwork() {
  const title = $("a-title").value.trim();
  const item = items.find((i) => i.id === editingId);

  if (!title) {
    toast("Please enter an artwork title.", true);
    return;
  }
  if (!item && !newImageFile) {
    toast("Please choose an image for the new artwork.", true);
    return;
  }

  const priceText = $("a-price").value.trim();
  if (priceText !== "" && isNaN(Number(priceText))) {
    toast("Please enter a valid price.", true);
    return;
  }

  const button = $("modal-save");
  button.disabled = true;
  button.textContent = "Saving...";

  try {
    const oldImageUrl = item ? item.image_url : null;
    let imageUrl = oldImageUrl;

    if (newImageFile) {
      imageUrl = await uploadImage(newImageFile);
    }

    const row = {
      title: title,
      category: $("a-category").value,
      year: $("a-year").value.trim() || null,
      dimensions: $("a-dimensions").value.trim() || null,
      location: $("a-location").value.trim() || null,
      description: $("a-desc").value.trim() || null,
      is_visible: $("a-visible").checked,
      is_featured: $("a-featured").checked,
      is_sold: $("a-sold").checked,
      not_for_sale:
        $("a-category").value === "canvas" && $("a-notforsale").checked,
      image_url: imageUrl,
    };

    let result;
    if (item) {
      result = await supabaseClient
        .from("gallery_items")
        .update(row)
        .eq("id", item.id)
        .select();
    } else {
      // New artwork goes to the end of the list
      const lastOrder = Math.max(0, ...items.map((i) => i.sort_order || 0));
      row.sort_order = lastOrder + 1;
      result = await supabaseClient
        .from("gallery_items")
        .insert([row])
        .select();
    }

    if (result.error) throw result.error;
    if (result.data.length === 0)
      throw new Error("Not allowed. Please log in again.");

    // Save the price too (only canvas artworks have one)
    let priceSaved = true;
    try {
      await savePrice(result.data[0].id, row);
    } catch (priceError) {
      console.error(priceError);
      priceSaved = false;
    }

    // Saved. Remove the replaced photo from storage
    if (newImageFile) deleteImage(oldImageUrl);

    await loadGallery();
    closeModal();

    if (priceSaved) {
      toast(item ? "Artwork updated." : "Artwork added.");
    } else {
      toast("Artwork saved, but the price could not be saved.", true);
    }
  } catch (err) {
    console.error(err);
    toast("Could not save: " + err.message, true);
  }

  button.disabled = false;
  button.textContent = "Save Changes";
}

async function deleteArtwork(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (!confirm('Delete "' + item.title + '"? This cannot be undone.')) return;

  try {
    const { data, error } = await supabaseClient
      .from("gallery_items")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;
    if (data.length === 0) throw new Error("Not allowed. Please log in again.");

    deleteImage(item.image_url);
    closeModal();
    await loadGallery();
    toast("Artwork deleted.");
  } catch (err) {
    console.error(err);
    toast("Could not delete: " + err.message, true);
  }
}

function setupModal() {
  $("modal-close").addEventListener("click", closeModal);
  $("modal-cancel").addEventListener("click", closeModal);
  $("modal-save").addEventListener("click", saveArtwork);
  $("modal-delete").addEventListener("click", () => deleteArtwork(editingId));
  $("a-desc").addEventListener("input", () => updateCount("a-desc", "a-count"));

  // Canvas artworks can have a price or be marked "not for sale"
  $("a-category").addEventListener("change", updateSaleBlock);
  $("a-notforsale").addEventListener("change", updateSaleBlock);
  $("a-price").addEventListener("input", () => {
    $("a-price").value = $("a-price").value.replace(/[^0-9.]/g, "");
  });

  // Click on the dark background closes the popup
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });

  // Escape key closes the popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Photo picker: click, keyboard, or drag and drop
  const dropzone = $("dropzone");

  dropzone.addEventListener("click", () => $("a-file").click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("a-file").click();
    }
  });
  $("a-file").addEventListener("change", (e) =>
    pickArtworkImage(e.target.files[0]),
  );

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("is-over");
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("is-over");
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-over");
    pickArtworkImage(e.dataTransfer.files[0]);
  });
}

// ===================== Start =====================
document.addEventListener("DOMContentLoaded", async () => {
  const loggedIn = await checkLogin();
  if (!loggedIn) return;

  setupProfile();
  setupGallery();
  setupModal();
  loadProfile();
  loadGallery();
});
