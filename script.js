const state = {
  products: [],
  category: "All",
  query: "",
  sort: "featured",
  cart: new Map(),
  template: null,
  activeProduct: null,
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
const text = (value = "") => String(value ?? "");
const photoPath = (filename) =>
  `assets/${encodeURIComponent(filename).replace(/%2F/g, "/")}`;
const optionsFor = (product) =>
  Object.entries(product.purchase_options || {}).filter(
    ([, price]) => Number.isFinite(Number(price)) && Number(price) >= 0,
  );
const priceFor = (product, quantity) =>
  Number(product.purchase_options?.[quantity]) || 0;
const cartKey = (id, quantity) => `${id}::${quantity}`;

function shortDescription(description = "") {
  const cleaned = text(description).replace(/\s+/g, " ").trim();
  return cleaned.length > 118 ? `${cleaned.slice(0, 115).trim()}…` : cleaned;
}

function enhanceSelect(select) {
  if (!select || select.dataset.enhanced === "true") return;
  select.dataset.enhanced = "true";
  const wrapper = document.createElement("div");
  wrapper.className = "ui-select";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ui-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "ui-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  const menuHost = () => wrapper.closest("dialog") || document.body;
  const close = () => {
    menu.hidden = true;
    menu.remove();
    trigger.setAttribute("aria-expanded", "false");
    wrapper.classList.remove("is-open");
  };
  const positionMenu = () => {
    const rect = trigger.getBoundingClientRect();
    const maxHeight = Math.min(260, window.innerHeight - 24);
    menu.style.position = "fixed";
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8))}px`;
    menu.style.minWidth = `${Math.max(rect.width, 100)}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    menu.style.top = "auto";
    menu.style.bottom = "auto";
    const below = window.innerHeight - rect.bottom;
    if (below >= Math.min(190, maxHeight) || below >= rect.top) {
      menu.style.top = `${Math.min(rect.bottom + 7, window.innerHeight - 16)}px`;
    } else {
      menu.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 7)}px`;
    }
  };
  const refresh = () => {
    const selected =
      [...select.options].find((option) => option.value === select.value) ||
      select.options[0];
    trigger.textContent = selected?.textContent || "Choose";
    menu.replaceChildren();
    [...select.options].forEach((option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ui-select-option";
      item.textContent = option.textContent;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === select.value));
      item.disabled = option.disabled;
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        refresh();
        close();
      });
      menu.append(item);
    });
  };
  trigger.addEventListener("click", () => {
    const opening = menu.hidden;
    document.querySelectorAll(".ui-select.is-open").forEach((node) => {
      node.classList.remove("is-open");
      const oldMenu = node._menu;
      if (oldMenu) {
        oldMenu.hidden = true;
        oldMenu.remove();
      }
      node
        .querySelector(".ui-select-trigger")
        ?.setAttribute("aria-expanded", "false");
    });
    if (!opening) {
      close();
      return;
    }
    menuHost().append(menu);
    menu.hidden = false;
    wrapper.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    positionMenu();
  });
  select.addEventListener("change", refresh);
  select.classList.add("native-select-hidden");
  // Card selectors are enhanced after they already exist in the document,
  // but the product-dialog selector is enhanced while it is still detached.
  // Support both cases: insert beside an attached select, or simply build
  // the wrapper around a detached select and let its caller append the wrapper.
  if (select.parentNode) select.parentNode.insertBefore(wrapper, select);
  wrapper.append(trigger, select);
  wrapper._menu = menu;
  refresh();
  return wrapper;
}

async function loadProducts() {
  const grid = $("#productGrid");
  try {
    const [productsResponse, templateResponse] = await Promise.all([
      fetch("snacks.json"),
      fetch("tile-template.html"),
    ]);
    if (!productsResponse.ok)
      throw new Error(`snacks.json returned ${productsResponse.status}`);
    if (!templateResponse.ok)
      throw new Error(`tile-template.html returned ${templateResponse.status}`);
    const products = await productsResponse.json();
    if (!Array.isArray(products))
      throw new Error("snacks.json must contain an array.");
    const templateDocument = new DOMParser().parseFromString(
      await templateResponse.text(),
      "text/html",
    );
    state.template = $("#productTileTemplate", templateDocument);
    if (!state.template) throw new Error("Product tile template is missing.");
    state.products = products;
    renderProducts();
  } catch (error) {
    console.error(error);
    grid.textContent = `Catalogue couldn't be loaded: ${error.message}. Run this site through a local server.`;
    $("#resultCount").textContent = "Catalogue unavailable";
  }
}

function filteredProducts() {
  const query = state.query.trim().toLocaleLowerCase();
  const products = state.products.filter((product) => {
    const matchesCategory =
      state.category === "All" || product.category === state.category;
    const searchable =
      `${product.name || ""} ${product.category || ""} ${product.description || ""}`.toLocaleLowerCase();
    return matchesCategory && (!query || searchable.includes(query));
  });
  if (state.sort === "name-asc")
    products.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === "price-asc")
    products.sort((a, b) => lowestPrice(a) - lowestPrice(b));
  if (state.sort === "price-desc")
    products.sort((a, b) => lowestPrice(b) - lowestPrice(a));
  return products;
}

function lowestPrice(product) {
  const prices = optionsFor(product).map(([, price]) => Number(price));
  return prices.length ? Math.min(...prices) : Number.POSITIVE_INFINITY;
}

function renderProducts() {
  const products = filteredProducts();
  const grid = $("#productGrid");
  const fragment = new DocumentFragment();
  $("#resultCount").textContent =
    `${products.length} ${products.length === 1 ? "snack" : "snacks"}`;
  if (!products.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "No snacks match that search. Try another name or category.";
    fragment.append(empty);
    grid.replaceChildren(fragment);
    return;
  }

  products.forEach((product, index) => {
    const tile = state.template.content.firstElementChild.cloneNode(true);
    tile.dataset.productId = product.id;
    const openButton = $("[data-open-product]", tile);
    openButton.setAttribute("aria-label", `View ${product.name} details`);
    $("[data-product-number]", tile).textContent =
      `${String(index + 1).padStart(2, "0")} / ${String(products.length).padStart(2, "0")}`;
    $("[data-product-name]", tile).textContent = product.name;
    $("[data-product-category]", tile).textContent =
      product.category || "Snack";
    $("[data-product-description]", tile).textContent = shortDescription(
      product.description,
    );

    const image = $("[data-product-image]", tile);
    const filename = product.photos?.[0];
    if (filename) {
      image.src = photoPath(filename);
      image.alt = product.name;
      image.addEventListener(
        "error",
        () => {
          image.hidden = true;
          const fallback = $("[data-image-fallback]", tile);
          fallback.hidden = false;
          fallback.textContent = product.name;
        },
        { once: true },
      );
    } else {
      image.hidden = true;
      const fallback = $("[data-image-fallback]", tile);
      fallback.hidden = false;
      fallback.textContent = product.name;
    }

    const select = $("[data-pack-select]", tile);
    const options = optionsFor(product);
    if (!options.length) {
      select.disabled = true;
      const option = new Option("Unavailable", "");
      select.add(option);
      $("[data-product-price]", tile).textContent = "Price unavailable";
      $("[data-add-to-cart]", tile).disabled = true;
    } else {
      options.forEach(([quantity]) =>
        select.add(new Option(quantity, quantity)),
      );
      $("[data-product-price]", tile).textContent = money(options[0][1]);
      select.addEventListener("change", () => {
        $("[data-product-price]", tile).textContent = money(
          priceFor(product, select.value),
        );
      });
    }
    enhanceSelect(select);
    $("[data-add-to-cart]", tile).setAttribute(
      "aria-label",
      `Add ${product.name} to bag`,
    );
    fragment.append(tile);
  });
  grid.replaceChildren(fragment);
}

function addToCart(productId, packSize) {
  const product = state.products.find((item) => item.id === productId);
  if (!product || !Object.hasOwn(product.purchase_options || {}, packSize))
    return;
  const key = cartKey(productId, packSize);
  state.cart.set(key, (state.cart.get(key) || 0) + 1);
  updateCart();
  showToast(`${product.name} · ${packSize} added`);
}

function updateCart() {
  let count = 0;
  let total = 0;
  const fragment = new DocumentFragment();
  for (const [key, quantity] of state.cart) {
    const [id, packSize] = key.split("::");
    const product = state.products.find((item) => item.id === id);
    if (!product) continue;
    const unitPrice = priceFor(product, packSize);
    count += quantity;
    total += unitPrice * quantity;
    const row = document.createElement("div");
    row.className = "cart-row";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const meta = document.createElement("small");
    meta.textContent = `${packSize} · ${money(unitPrice * quantity)}`;
    details.append(name, meta);
    const controls = document.createElement("div");
    controls.className = "quantity-controls";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.dataset.cartKey = key;
    minus.dataset.change = "-1";
    minus.textContent = "−";
    minus.setAttribute("aria-label", `Remove one ${product.name}`);
    const amount = document.createElement("span");
    amount.textContent = quantity;
    const plus = document.createElement("button");
    plus.type = "button";
    plus.dataset.cartKey = key;
    plus.dataset.change = "1";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Add one ${product.name}`);
    controls.append(minus, amount, plus);
    row.append(details, controls);
    fragment.append(row);
  }
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(total);
  if (!count) {
    const empty = document.createElement("p");
    empty.className = "empty-cart";
    empty.textContent = "Your bag is empty.";
    fragment.append(empty);
  }
  $("#cartItems").replaceChildren(fragment);
}

function changeCartQuantity(key, change) {
  const next = (state.cart.get(key) || 0) + change;
  if (next <= 0) state.cart.delete(key);
  else state.cart.set(key, next);
  updateCart();
}

function openProduct(productId) {
  const product = state.products.find(
    (item) => String(item.id) === String(productId),
  );
  if (!product) return;
  state.activeProduct = product;
  const content = $("#productDialogContent");
  const options = optionsFor(product);
  const gallery = document.createElement("div");
  gallery.className = "dialog-gallery";
  const photos = (product.photos || []).filter(Boolean);
  const galleryImage = document.createElement("img");
  galleryImage.className = "gallery-current-image";
  galleryImage.alt = product.name;
  galleryImage.draggable = false;
  const galleryControls = document.createElement("div");
  galleryControls.className = "gallery-controls";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.className = "gallery-arrow";
  previous.textContent = "←";
  previous.setAttribute("aria-label", "Previous product image");
  const galleryCount = document.createElement("span");
  galleryCount.className = "gallery-count";
  const next = document.createElement("button");
  next.type = "button";
  next.className = "gallery-arrow";
  next.textContent = "→";
  next.setAttribute("aria-label", "Next product image");
  let photoIndex = 0;
  const showPhoto = () => {
    if (!photos.length) {
      galleryImage.hidden = true;
      gallery.classList.add("gallery-empty");
      galleryCount.textContent = "No product photos";
      previous.disabled = next.disabled = true;
      return;
    }
    galleryImage.hidden = false;
    galleryImage.src = photoPath(photos[photoIndex]);
    galleryCount.textContent = `${photoIndex + 1} / ${photos.length}`;
    previous.disabled = next.disabled = photos.length < 2;
  };
  previous.addEventListener("click", () => {
    photoIndex = (photoIndex - 1 + photos.length) % photos.length;
    showPhoto();
  });
  next.addEventListener("click", () => {
    photoIndex = (photoIndex + 1) % photos.length;
    showPhoto();
  });
  galleryControls.append(previous, galleryCount, next);
  gallery.append(galleryImage, galleryControls);
  showPhoto();
  const details = document.createElement("div");
  details.className = "dialog-details";
  const category = document.createElement("p");
  category.className = "eyebrow";
  category.textContent = product.category || "Snack";
  const title = document.createElement("h2");
  title.id = "dialogProductName";
  title.textContent = product.name;
  const description = document.createElement("p");
  description.className = "dialog-description";
  description.textContent = product.description || "";
  const buy = document.createElement("div");
  buy.className = "dialog-buy";
  const select = document.createElement("select");
  select.id = "dialogPackSize";
  select.setAttribute("aria-label", "Choose pack size");
  const price = document.createElement("strong");
  price.className = "dialog-price";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "button button-dark";
  add.textContent = "Add to bag";
  if (!options.length) {
    select.disabled = true;
    add.disabled = true;
    price.textContent = "Price unavailable";
  } else {
    options.forEach(([size]) => select.add(new Option(size, size)));
    price.textContent = money(options[0][1]);
    select.addEventListener(
      "change",
      () => (price.textContent = money(priceFor(product, select.value))),
    );
    add.addEventListener("click", () => {
      addToCart(product.id, select.value);
      closeProduct();
    });
  }
  enhanceSelect(select);
  buy.append(select.parentElement, price, add);
  details.append(category, title, description, buy);
  content.replaceChildren(gallery, details);
  const dialog = $("#productDialog");
  if (!dialog.open) dialog.showModal();
}

function closeProduct() {
  const dialog = $("#productDialog");
  if (dialog.open) dialog.close();
  state.activeProduct = null;
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#cartDrawer").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeCart() {
  $("#cartDrawer").classList.remove("open");
  $("#cartDrawer").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

$("#categoryFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  $("#categoryFilters")
    .querySelectorAll("[data-category]")
    .forEach((chip) => {
      const active = chip === button;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
  renderProducts();
});

$("#productGrid").addEventListener("click", (event) => {
  const card = event.target.closest("[data-product-card]");
  if (!card) return;

  const add = event.target.closest("[data-add-to-cart]");
  if (add) {
    const packSelect = $("[data-pack-select]", card);
    addToCart(card.dataset.productId, packSelect?.value);
    return;
  }

  // Open from the visual/content area only. Pack menus and purchase buttons
  // remain independent controls and must never open the product dialog.
  if (
    event.target.closest("[data-open-product]") &&
    !event.target.closest(".ui-select, select, button, input, a")
  ) {
    openProduct(card.dataset.productId);
  }
});

$("#productGrid").addEventListener("keydown", (event) => {
  const opener = event.target.closest("[data-open-product]");
  if (!opener || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  const card = opener.closest("[data-product-card]");
  if (card) openProduct(card.dataset.productId);
});

$("#cartItems").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart-key]");
  if (button)
    changeCartQuantity(button.dataset.cartKey, Number(button.dataset.change));
});
$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderProducts();
});
$("#sortSelect").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});
$("#toolsToggle").addEventListener("click", () => {
  const panel = $("#shopToolsPanel");
  const opening = panel.style.display === "none";
  panel.style.display = opening ? "flex" : "none";
  $("#toolsToggle").setAttribute("aria-expanded", String(opening));
  if (opening) $("#searchInput").focus();
});
$("#cartButton").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#drawerBackdrop").addEventListener("click", closeCart);
$("#closeProductDialog").addEventListener("click", closeProduct);
$("#productDialog").addEventListener("click", (event) => {
  if (event.target === $("#productDialog")) closeProduct();
});
$("#checkoutButton").addEventListener("click", () =>
  showToast(state.cart.size ? "Order summary ready." : "Your bag is empty."),
);
document.addEventListener("click", (event) => {
  if (event.target.closest(".ui-select, .ui-select-menu")) return;
  document.querySelectorAll(".ui-select.is-open").forEach((node) => {
    node.classList.remove("is-open");
    if (node._menu) {
      node._menu.hidden = true;
      node._menu.remove();
    }
    node
      .querySelector(".ui-select-trigger")
      ?.setAttribute("aria-expanded", "false");
  });
});
window.addEventListener("resize", () => {
  document.querySelectorAll(".ui-select.is-open").forEach((node) => {
    const trigger = node.querySelector(".ui-select-trigger");
    const menu = node._menu;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 188))}px`;
    menu.style.top = `${Math.min(rect.bottom + 7, window.innerHeight - 16)}px`;
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCart();
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    const panel = $("#shopToolsPanel");
    if (panel.style.display === "none") {
      panel.style.display = "flex";
      $("#toolsToggle").setAttribute("aria-expanded", "true");
    }
    $("#searchInput").focus();
  }
});

enhanceSelect($("#sortSelect"));
loadProducts();
