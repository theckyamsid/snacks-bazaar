const state = {
  products: [],
  category: "All",
  query: "",
  cart: new Map(),
};

const $ = (selector) => document.querySelector(selector);
const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

function safeText(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );
}

function photoPath(filename) {
  return `assets/${encodeURIComponent(filename).replace(/%2F/g, "/")}`;
}

function shortDescription(description = "") {
  const cleaned = String(description).replace(/\s+/g, " ").trim();
  if (!cleaned) return "A familiar favourite for your evening snack break.";
  return cleaned.length > 105 ? `${cleaned.slice(0, 102).trim()}…` : cleaned;
}

async function loadProducts() {
  const grid = $("#productGrid");
  try {
    const response = await fetch("snacks.json");
    if (!response.ok)
      throw new Error(`Could not load snacks.json (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data))
      throw new Error("snacks.json should contain an array of products.");
    state.products = data;
    renderProducts();
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<div class="empty-state">Couldn't load the snack tin.<br><small>${safeText(error.message)} — run this site through a local server, not file://</small></div>`;
    $("#resultCount").textContent = "Catalogue unavailable";
  }
}

function filteredProducts() {
  const query = state.query.trim().toLowerCase();
  return state.products.filter((product) => {
    const categoryMatch =
      state.category === "All" || product.category === state.category;
    const searchText =
      `${product.name || ""} ${product.category || ""} ${product.description || ""}`.toLowerCase();
    return categoryMatch && (!query || searchText.includes(query));
  });
}

function renderProducts() {
  const products = filteredProducts();
  $("#resultCount").textContent =
    `${products.length} ${products.length === 1 ? "snack" : "snacks"} to choose from`;
  if (!products.length) {
    $("#productGrid").innerHTML =
      `<div class="empty-state">Nothing in the tin by that name.<br><small>Try another search or category.</small></div>`;
    return;
  }

  $("#productGrid").innerHTML = products
    .map((product, index) => {
      const image = product.photos?.[0] ? photoPath(product.photos[0]) : "";
      const price = money(product.pricePer250g);
      return `
      <article class="product-card">
        <div class="product-image">
          <span class="product-number">${String(index + 1).padStart(2, "0")} / ${String(products.length).padStart(2, "0")}</span>
          ${image ? `<img src="${image}" alt="${safeText(product.name)}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.hidden=false">` : ""}
          <div class="image-fallback" ${image ? "hidden" : ""}>${safeText(product.name)}</div>
          <span class="product-category">${safeText(product.category || "Snack")}</span>
        </div>
        <div class="product-info">
          <div class="product-title-row"><h3 class="product-title">${safeText(product.name)}</h3></div>
          <p class="product-description">${safeText(shortDescription(product.description))}</p>
          <div class="product-buy-row">
            <span class="product-price">${price} <small>/ 250 g</small></span>
            <button class="add-button" data-add="${safeText(product.id)}" aria-label="Add ${safeText(product.name)} to bag">+</button>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

function addToCart(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  const current = state.cart.get(id) || 0;
  state.cart.set(id, current + 1);
  updateCart();
  showToast(`${product.name} added to your bag`);
}

function updateCart() {
  const count = [...state.cart.values()].reduce(
    (sum, quantity) => sum + quantity,
    0,
  );
  const total = state.products.reduce((sum, product) => {
    return (
      sum +
      (Number(product.pricePer250g) || 0) * (state.cart.get(product.id) || 0)
    );
  }, 0);
  $("#cartCount").textContent = count;
  $("#cartTotal").textContent = money(total);

  const entries = [...state.cart.entries()];
  if (!entries.length) {
    $("#cartItems").innerHTML =
      `<p class="empty-cart">Your bag is waiting for something crunchy.</p>`;
    return;
  }
  $("#cartItems").innerHTML = entries
    .map(([id, quantity]) => {
      const product = state.products.find((item) => item.id === id);
      if (!product) return "";
      return `<div class="cart-row">
      <div><strong>${safeText(product.name)}</strong><small>${money(product.pricePer250g)} / 250 g · ${money(product.pricePer250g * quantity)}</small></div>
      <div class="quantity-controls">
        <button data-quantity="${safeText(id)}" data-change="-1" aria-label="Remove one">−</button>
        <span>${quantity}</span>
        <button data-quantity="${safeText(id)}" data-change="1" aria-label="Add one">+</button>
      </div>
    </div>`;
    })
    .join("");
}

function changeQuantity(id, change) {
  const next = (state.cart.get(id) || 0) + change;
  if (next <= 0) state.cart.delete(id);
  else state.cart.set(id, next);
  updateCart();
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
  document
    .querySelectorAll(".filter-chip")
    .forEach((chip) => chip.classList.toggle("active", chip === button));
  renderProducts();
});

$("#productGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

$("#cartItems").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quantity]");
  if (button)
    changeQuantity(button.dataset.quantity, Number(button.dataset.change));
});

$("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderProducts();
});

$("#cartButton").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
$("#drawerBackdrop").addEventListener("click", closeCart);
$("#checkoutButton").addEventListener("click", () => {
  showToast(
    state.cart.size
      ? "Checkout can be connected to your payment flow."
      : "Your bag is empty for now.",
  );
});
$("#menuToggle").addEventListener("click", () =>
  $(".main-nav").classList.toggle("open"),
);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCart();
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    $("#searchInput").focus();
  }
});

loadProducts();
