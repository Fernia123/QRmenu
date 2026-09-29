import {
  fetchCategorias,
  fetchPlatos,
  addPlato as dbAddPlato,
  updatePlato as dbUpdatePlato,
  deletePlato as dbDeletePlato,
  togglePlatoDisponible as dbTogglePlatoDisponible,
  type Categoria,
  type Plato
} from '../db/database';

interface Bootstrap {
  categories: Categoria[];
  dishes: Plato[];
  clienteId?: string | null;
}

const SETTINGS_KEY = 'micarta:settings:v1';
const FALLBACK_ICON = '🍽️';

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

let categories: Categoria[] = [];
let dishes: Plato[] = [];
let query = '';
let activeCategory = 'all';
let view: 'grid' | 'list' = 'grid';
const collapsed = new Set<string>();
let restaurantName = '';
let slogan = '';
let currentClientId: string | null = null;


// ── Carga inicial desde la BD ────────────────────────────────────

function load(bootstrap: Bootstrap): void {
  categories = bootstrap.categories ?? [];
  dishes = bootstrap.dishes ?? [];
  currentClientId = bootstrap.clienteId ?? null;
}

function loadSettings(): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { name?: string; slogan?: string };
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.name === 'string' && parsed.name.trim()) restaurantName = parsed.name.trim();
        if (typeof parsed.slogan === 'string' && parsed.slogan.trim()) slogan = parsed.slogan.trim();
      }
    }
  } catch {
    /* corrupted settings → keep defaults */
  }
}

// ── Helpers ──────────────────────────────────────────────────

const getCategory = (id: string) => categories.find((c) => c.id === id);
const categoryIcon = (id: string) => getCategory(id)?.icono ?? FALLBACK_ICON;
const categoryGradient = (id: string) => getCategory(id)?.gradiente ?? 'from-ink-100 to-ink-200';
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch
  );

function matchesFilters(dish: Plato): boolean {
  const matchCategory = activeCategory === 'all' || dish.categoria_id === activeCategory;
  const matchQuery =
    query === '' ||
    dish.nombre.toLowerCase().includes(query) ||
    dish.descripcion.toLowerCase().includes(query) ||
    (getCategory(dish.categoria_id)?.nombre.toLowerCase().includes(query) ?? false);
  return matchCategory && matchQuery;
}

// ── Dish cards (manager) ─────────────────────────────────────

function dishCard(dish: Plato): string {
  return `
    <article data-dish-id="${dish.id}" class="dish-card group border border-ink-200 rounded-2xl overflow-hidden bg-white hover:shadow-md hover:border-ink-300 transition-all">
      <div class="h-28 bg-gradient-to-br ${categoryGradient(dish.categoria_id)} flex items-center justify-center text-5xl ${dish.disponible ? '' : 'grayscale opacity-50'}">
        ${categoryIcon(dish.categoria_id)}
      </div>
      <div class="p-3.5">
        <div class="flex justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[10px] text-brand-500 font-semibold mb-0.5 uppercase tracking-wide">${escapeHtml(getCategory(dish.categoria_id)?.nombre ?? '')}</p>
            <h4 class="font-bold text-sm text-ink-900 truncate">${escapeHtml(dish.nombre)}</h4>
          </div>
          <span class="font-bold text-sm text-brand-600 shrink-0">S/${dish.precio}</span>
        </div>
        <p class="text-xs text-ink-500 mt-1.5 line-clamp-2">${escapeHtml(dish.descripcion)}</p>
        <div class="flex items-center justify-between gap-2 mt-3">
          <button data-action="toggle" class="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition ${dish.disponible ? 'bg-mint-100 text-mint-600' : 'bg-ink-100 text-ink-500 line-through'}">
            ${dish.disponible ? 'Disponible' : 'Agotado'}
          </button>
          <div class="flex gap-1.5">
            <button data-action="edit" class="w-8 h-8 rounded-lg bg-ink-100 hover:bg-ink-200 text-ink-600 transition flex items-center justify-center" title="Editar" aria-label="Editar ${escapeHtml(dish.nombre)}">✏️</button>
            <button data-action="delete" class="w-8 h-8 rounded-lg bg-cherry-100 hover:bg-cherry-500/20 text-cherry-600 transition flex items-center justify-center" title="Eliminar" aria-label="Eliminar ${escapeHtml(dish.nombre)}">🗑️</button>
          </div>
        </div>
      </div>
    </article>`;
}

function dishRow(dish: Plato): string {
  return `
    <article data-dish-id="${dish.id}" class="dish-card flex items-center gap-3 p-3 border border-ink-200 rounded-2xl bg-white hover:shadow-md hover:border-ink-300 transition-all">
      <span class="w-12 h-12 rounded-xl bg-gradient-to-br ${categoryGradient(dish.categoria_id)} flex items-center justify-center text-2xl shrink-0 ${dish.disponible ? '' : 'grayscale opacity-50'}">
        ${categoryIcon(dish.categoria_id)}
      </span>
      <span class="flex-1 min-w-0">
        <span class="flex items-center gap-2">
          <span class="font-bold text-sm text-ink-900 truncate">${escapeHtml(dish.nombre)}</span>
          ${dish.disponible ? '' : '<span class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-cherry-100 text-cherry-600 rounded-full shrink-0">Agotado</span>'}
        </span>
        <span class="block text-xs text-ink-400 truncate mt-0.5">${escapeHtml(dish.descripcion)}</span>
      </span>
      <span class="font-bold text-sm text-brand-600 shrink-0">S/${dish.precio}</span>
      <span class="flex gap-1 shrink-0">
        <button data-action="toggle" class="w-8 h-8 rounded-lg ${dish.disponible ? 'bg-mint-100 text-mint-600' : 'bg-ink-100 text-ink-500'} transition flex items-center justify-center" title="${dish.disponible ? 'Marcar agotado' : 'Marcar disponible'}">${dish.disponible ? '✓' : '✕'}</button>
        <button data-action="edit" class="w-8 h-8 rounded-lg bg-ink-100 hover:bg-ink-200 text-ink-600 transition flex items-center justify-center" title="Editar">✏️</button>
        <button data-action="delete" class="w-8 h-8 rounded-lg bg-cherry-100 hover:bg-cherry-500/20 text-cherry-600 transition flex items-center justify-center" title="Eliminar">🗑️</button>
      </span>
    </article>`;
}

// ── Live preview ─────────────────────────────────────────────

function previewItems(categoryId: string, limit: number): string {
  return dishes
    .filter((d) => d.categoria_id === categoryId && d.disponible)
    .slice(0, limit)
    .map(
      (d) => `
      <div class="flex justify-between gap-2 py-1.5 border-b border-ink-100 last:border-0">
        <span class="min-w-0">
          <span class="block font-semibold text-[11px] text-ink-800 truncate">${escapeHtml(d.nombre)}</span>
          <span class="block text-[9px] text-ink-400 line-clamp-1">${escapeHtml(d.descripcion)}</span>
        </span>
        <span class="font-bold text-[11px] text-brand-600 shrink-0">S/${d.precio}</span>
      </div>`
    )
    .join('');
}

function previewSectionsHtml(): string {
  return categories
    .filter((c) => dishes.some((d) => d.categoria_id === c.id))
    .map(
      (c) => `
      <section data-preview-cat="${c.id}">
        <h5 class="text-brand-500 font-bold text-[9px] uppercase tracking-wider mb-1">${escapeHtml(c.nombre)}</h5>
        ${previewItems(c.id, 3) || '<p class="text-[10px] text-ink-400 italic">Sin platos</p>'}
      </section>`
    )
    .join('');
}

function renderPreview(): void {
  const catsHtml = previewSectionsHtml();

  const mobile = $('previewMobile');
  if (mobile) {
    mobile.innerHTML = `
      <div class="bg-cream text-ink-900 rounded-[1.6rem] overflow-hidden h-full flex flex-col">
        <div class="bg-gradient-to-br from-ink-800 to-ink-950 text-white p-4 text-center shrink-0">
          <span class="text-2xl">${FALLBACK_ICON}</span>
          <h4 class="font-display font-bold text-sm mt-1">${escapeHtml(restaurantName)}</h4>
          <p class="text-[9px] text-ink-300">${escapeHtml(slogan)}</p>
        </div>
        <div class="p-3.5 space-y-4 overflow-y-auto flex-1">${catsHtml}</div>
      </div>`;
  }

  const desktop = $('previewDesktop');
  if (desktop) {
    desktop.innerHTML = `
      <div class="bg-white text-ink-900 rounded-xl overflow-hidden h-full flex flex-col shadow-2xl">
        <div class="bg-gradient-to-br from-ink-800 to-ink-950 text-white px-4 py-5 text-center shrink-0">
          <span class="text-xl">${FALLBACK_ICON}</span>
          <h4 class="font-display font-bold text-sm mt-1">${escapeHtml(restaurantName)}</h4>
          <p class="text-[9px] text-ink-300">${escapeHtml(slogan)} · Carta digital</p>
        </div>
        <div class="p-4 grid grid-cols-2 gap-x-5 gap-y-4 overflow-y-auto flex-1">${catsHtml}</div>
      </div>`;
  }
}

// ── Grouped sections ─────────────────────────────────────────

function groupSectionsHtml(): string {
  const groups = categories
    .map((c) => ({
      category: c,
      items: dishes.filter((d) => d.categoria_id === c.id && matchesFilters(d)),
    }))
    .filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return `
      <div class="col-span-full text-center py-14 text-ink-400">
        <p class="text-3xl mb-2">🔎</p>
        <p class="text-sm">No se encontraron platos.</p>
        <button id="emptyAddBtn" class="mt-3 text-xs font-semibold text-brand-500 hover:text-brand-600">+ Agregar un plato</button>
      </div>`;
  }

  return groups
    .map(({ category, items }) => {
      const isCollapsed = collapsed.has(category.id);
      const available = items.filter((d) => d.disponible).length;
      const prices = items.map((d) => d.precio);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const cards = items.map(view === 'grid' ? dishCard : dishRow).join('');
      const bodyClass = view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-2.5';

      return `
        <section data-group="${category.id}" class="group-section">
          <button
            data-toggle-group="${category.id}"
            class="w-full flex items-center gap-3 px-1 py-2.5 text-left"
            aria-expanded="${!isCollapsed}"
          >
            <span class="w-9 h-9 rounded-xl bg-gradient-to-br ${category.gradiente} flex items-center justify-center text-lg shrink-0">${category.icono}</span>
            <span class="min-w-0 flex-1">
              <span class="block font-bold text-sm text-ink-900 leading-tight">${escapeHtml(category.nombre)}</span>
              <span class="block text-[11px] text-ink-400 leading-tight mt-0.5">
                ${items.length} ${items.length === 1 ? 'plato' : 'platos'} · ${available} disponibles · S/${min}–S/${max}
              </span>
            </span>
            <span class="toggle-chevron text-ink-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}">▾</span>
          </button>
          <div class="group-body ${bodyClass} pb-4 ${isCollapsed ? 'hidden' : ''}">
            ${cards}
          </div>
        </section>`;
    })
    .join('');
}

// ── Render ───────────────────────────────────────────────────

function render(): void {
  const grid = $('dishesGrid');
  const list = $('dishesList');
  const html = groupSectionsHtml();

  if (grid) {
    grid.innerHTML = view === 'grid' ? html : '';
    grid.classList.toggle('hidden', view !== 'grid');
  }
  if (list) {
    list.innerHTML = view === 'list' ? html : '';
    list.classList.toggle('hidden', view !== 'list');
  }

  // Live stats
  const statDishes = $('statDishes');
  if (statDishes) statDishes.textContent = String(dishes.length);

  // Banner sentence + sold-out KPI
  const bannerAvailable = $('bannerAvailable');
  if (bannerAvailable) bannerAvailable.textContent = String(dishes.filter((d) => d.disponible).length);
  const bannerTotal = $('bannerTotal');
  if (bannerTotal) bannerTotal.textContent = String(dishes.length);
  const statSoldOut = $('statSoldOut');
  if (statSoldOut) statSoldOut.textContent = String(dishes.filter((d) => !d.disponible).length);

  const statAvailable = $('statAvailable');
  if (statAvailable) statAvailable.textContent = String(dishes.filter((d) => d.disponible).length);

  const statAvg = $('statAvg');
  if (statAvg) {
    statAvg.textContent = dishes.length
      ? `S/${(dishes.reduce((sum, d) => sum + d.precio, 0) / dishes.length).toFixed(1).replace('.0', '')}`
      : 'S/0';
  }

  // Filter chip counts
  document.querySelectorAll('[data-filter-count]').forEach((el) => {
    const id = el.getAttribute('data-filter-count') ?? 'all';
    el.textContent = id === 'all' ? String(dishes.length) : String(dishes.filter((d) => d.categoria_id === id).length);
  });

  // Category card counts (bottom section)
  document.querySelectorAll('[data-category-count]').forEach((el) => {
    const id = el.getAttribute('data-category-count') ?? '';
    el.textContent = `${dishes.filter((d) => d.categoria_id === id).length} platos`;
  });

  renderPreview();
}

// ── Modal ────────────────────────────────────────────────────

let editingId: string | null = null;

function openModal(dish?: Plato): void {
  const modal = $('dishModal');
  if (!modal) return;

  editingId = dish?.id ?? null;
  const title = $('modalTitle');
  if (title) title.textContent = dish ? 'Editar plato' : 'Nuevo plato';

  const form = $('dishForm') as HTMLFormElement | null;
  if (form) {
    form.reset();
    if (dish) {
      ($('dishName') as HTMLInputElement).value = dish.nombre;
      ($('dishDescription') as HTMLTextAreaElement).value = dish.descripcion;
      ($('dishPrice') as HTMLInputElement).value = String(dish.precio);
      ($('dishCategory') as HTMLSelectElement).value = dish.categoria_id;
    }
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  ($('dishName') as HTMLInputElement | null)?.focus();
}

function closeModal(): void {
  $('dishModal')?.classList.add('hidden');
  document.body.style.overflow = '';
  editingId = null;
}

async function submitForm(e: Event): Promise<void> {
  e.preventDefault();
  const form = e.target as HTMLFormElement;

  const nombre = ($('dishName') as HTMLInputElement).value.trim();
  const descripcion = ($('dishDescription') as HTMLTextAreaElement).value.trim();
  const precio = Number(($('dishPrice') as HTMLInputElement).value);
  const categoria_id = ($('dishCategory') as HTMLSelectElement).value;

  if (!nombre || !Number.isFinite(precio) || precio < 0) return;

  try {
    if (editingId) {
      await dbUpdatePlato(editingId, { nombre, descripcion, precio, categoria_id, disponible: true });
    } else {
      await dbAddPlato({ nombre, descripcion, precio, categoria_id, disponible: true, cliente_id: currentClientId ?? undefined });
    }
    dishes = await refreshDishes();
  } catch (err) {
    console.error('Error guardando plato en Supabase:', err);
  }

  render();
  closeModal();
  void form;
}

async function refreshDishes(): Promise<Plato[]> {
  return currentClientId
    ? fetchPlatos({ clienteId: currentClientId })
    : fetchPlatos();
}

async function deleteDish(id: string): Promise<void> {
  const dish = dishes.find((d) => d.id === id);
  if (!dish) return;
  if (!confirm(`¿Eliminar "${dish.nombre}" de tu carta?`)) return;

  try {
    await dbDeletePlato(id);
    dishes = await refreshDishes();
  } catch (err) {
    console.error('Error eliminando plato en Supabase:', err);
  }
  render();
}

async function toggleDish(id: string): Promise<void> {
  const dish = dishes.find((d) => d.id === id);
  if (!dish) return;

  try {
    await dbTogglePlatoDisponible(id);
    dishes = await refreshDishes();
  } catch (err) {
    console.error('Error cambiando estado en Supabase:', err);
  }
  render();
}

// ── Settings ─────────────────────────────────────────────────

function saveSettings(): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ name: restaurantName, slogan }));
  } catch {
    /* storage unavailable */
  }
}

export function initConfig(): void {
  loadSettings();

  const form = $('configForm') as HTMLFormElement | null;
  const nameInput = $('configName') as HTMLInputElement | null;
  const sloganInput = $('configSlogan') as HTMLInputElement | null;
  const status = $('configStatus');
  if (!form || !nameInput || !sloganInput) return;

  nameInput.value = restaurantName;
  sloganInput.value = slogan;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const sl = sloganInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    restaurantName = name;
    slogan = sl || slogan;
    saveSettings();
    renderPreview();
    if (status) {
      status.textContent = 'Cambios guardados';
      status.classList.remove('opacity-0');
      window.setTimeout(() => status?.classList.add('opacity-0'), 2200);
    }
  });
}

// ── Filter helper ────────────────────────────────────────────

function setFilter(categoryId: string): void {
  activeCategory = categoryId;
  collapsed.clear();

  document.querySelectorAll('[data-filter]').forEach((el) => {
    const active = el.getAttribute('data-filter') === categoryId;
    el.classList.toggle('bg-ink-900', active);
    el.classList.toggle('text-white', active);
    el.classList.toggle('border-ink-900', active);
    el.classList.toggle('bg-white', !active);
    el.classList.toggle('text-ink-600', !active);
    el.classList.toggle('border-ink-200', !active);
  });

  render();
}

function jumpToFirstGroup(): void {
  if (query === '') return;
  const first = document.querySelector(
    '#dishesGrid:not(.hidden) [data-group], #dishesList:not(.hidden) [data-group]'
  );
  first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Init ─────────────────────────────────────────────────────

export function initDashboard(): void {
  const bootstrapEl = $('menu-bootstrap');
  if (!bootstrapEl) return;

  loadSettings();
  load(JSON.parse(bootstrapEl.textContent ?? '{}') as Bootstrap);
  render();

  // Search
  $('searchInput')?.addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value.trim().toLowerCase();
    collapsed.clear();
    render();
    jumpToFirstGroup();
  });

  // Category jump-filter (stats card + category cards)
  document.querySelectorAll('[data-jump-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      setFilter(el.getAttribute('data-jump-filter') ?? 'all');
      document.getElementById('platos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Filter chips
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => setFilter(chip.getAttribute('data-filter') ?? 'all'));
  });

  // View toggle
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      view = (btn.getAttribute('data-view') ?? 'grid') as typeof view;
      document.querySelectorAll('[data-view]').forEach((el) => {
        const active = el === btn;
        el.classList.toggle('bg-ink-900', active);
        el.classList.toggle('text-white', active);
        el.classList.toggle('text-ink-500', !active);
      });
      render();
    });
  });

  // Add dish
  $('addDishBtn')?.addEventListener('click', () => openModal());

  // Card + group actions (delegation on both containers)
  const onContainerClick = (e: Event) => {
    const target = e.target as HTMLElement;

    const toggleBtn = target.closest('button[data-toggle-group]');
    if (toggleBtn) {
      const groupId = toggleBtn.getAttribute('data-toggle-group') ?? '';
      const section = toggleBtn.closest('.group-section');
      const isCollapsed = collapsed.has(groupId);

      if (isCollapsed) {
        collapsed.delete(groupId);
        section?.querySelector('.group-body')?.classList.remove('hidden');
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.querySelector('.toggle-chevron')?.classList.add('rotate-180');
      } else {
        collapsed.add(groupId);
        section?.querySelector('.group-body')?.classList.add('hidden');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.querySelector('.toggle-chevron')?.classList.remove('rotate-180');
      }
      return;
    }

    const btn = target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('[data-dish-id]')?.getAttribute('data-dish-id');
    if (!id) return;

    const action = btn.getAttribute('data-action');
    if (action === 'edit') openModal(dishes.find((d) => d.id === id));
    else if (action === 'delete') deleteDish(id);
    else if (action === 'toggle') toggleDish(id);
  };
  $('dishesGrid')?.addEventListener('click', onContainerClick);
  $('dishesList')?.addEventListener('click', onContainerClick);

  // Empty-state add button (delegated)
  document.body.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'emptyAddBtn') openModal();
  });

  // Modal
  $('dishForm')?.addEventListener('submit', submitForm);
  $('modalCancel')?.addEventListener('click', closeModal);
  $('modalClose')?.addEventListener('click', closeModal);
  $('dishModal')?.addEventListener('click', (e) => {
    if (e.target === $('dishModal')) closeModal();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeModal());

  // Preview device tabs
  const tabMobile = $('previewTabMobile');
  const tabDesktop = $('previewTabDesktop');
  const frameMobile = $('previewDeviceMobile');
  const frameDesktop = $('previewDeviceDesktop');

  function setDevice(device: 'mobile' | 'desktop'): void {
    const mobileActive = device === 'mobile';
    frameMobile?.classList.toggle('hidden', !mobileActive);
    frameDesktop?.classList.toggle('hidden', mobileActive);
    tabMobile?.classList.toggle('bg-white', mobileActive);
    tabMobile?.classList.toggle('text-ink-900', mobileActive);
    tabDesktop?.classList.toggle('bg-white', !mobileActive);
    tabDesktop?.classList.toggle('text-ink-900', !mobileActive);
  }

  tabMobile?.addEventListener('click', () => setDevice('mobile'));
  tabDesktop?.addEventListener('click', () => setDevice('desktop'));

  initConfig();
}