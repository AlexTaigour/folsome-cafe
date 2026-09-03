import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, X, Utensils, ClipboardList, CheckCircle2, Search, Plus, Minus, Trash2, Receipt, Wifi, Navigation } from 'lucide-react';
import { fetchMenu, fetchTables, placeOrder, fetchOrderGateStatus } from '../api/client';
import { getSocket } from '../api/socket';
import { MenuCard } from '../components/MenuCard';
import ItemDetailModal from '../components/ItemDetailModal';
import { SteamAnimation } from '../components/SteamAnimation';
import BlurText from '../components/reactbits/BlurText';
import AnimatedList from '../components/reactbits/AnimatedList';
import ClickSpark from '../components/reactbits/ClickSpark';
import ShinyButton from '../components/reactbits/ShinyButton';
import CountUp from '../components/reactbits/CountUp';

// Returning customers skip retyping their details.
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem('hcp_customer') || '{}');
  } catch {
    return {};
  }
})();

const lastOrderCode = () => {
  try {
    const { code, at } = JSON.parse(localStorage.getItem('hcp_last_order') || '{}');
    // only offer tracking for a recent order (same visit, ~3h)
    return code && Date.now() - at < 3 * 60 * 60 * 1000 ? code : null;
  } catch {
    return null;
  }
};


// One-shot browser GPS read for the in-café geofence. Rejects on denial/timeout
// so the caller can tell the customer what to do. Needs https (the live site).
function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no-geo'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  });
}

const CustomerView = () => {
  const navigate = useNavigate();
  const qrTable = useMemo(
    () => (new URLSearchParams(window.location.search).get('table') || '').trim(),
    []
  );
  const [menu, setMenu] = useState(null);
  const [tables, setTables] = useState([]);
  const [cart, setCart] = useState({});
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [detailItemId, setDetailItemId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // In-café gate. allowed=true unless a check blocks; needLocation → prompt for
  // GPS; tooFar → location shared but outside the café. Fail open on errors.
  const [gate, setGate] = useState({ allowed: true, needLocation: false, tooFar: false, distance: null });
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState('');
  const coordsRef = useRef(null); // last GPS fix, sent with the order
  const canOrder = gate.allowed;
  const [formData, setFormData] = useState({
    name: saved.name || '',
    phone: saved.phone || '',
    table: qrTable,
    orderType: 'dine',
    note: '',
  });
  const trackable = useMemo(lastOrderCode, []);

  // Derived from the live menu so socket menu:updated refreshes flow into an
  // open modal (e.g. it flips to sold-out live); closes if the item is deleted.
  const detailItem = useMemo(
    () => (menu && detailItemId != null ? menu.find((m) => m.id === detailItemId) || null : null),
    [menu, detailItemId]
  );
  useEffect(() => {
    if (detailItemId != null && menu && !detailItem) setDetailItemId(null);
  }, [detailItemId, menu, detailItem]);

  useEffect(() => {
    const locked = showOrderForm || detailItemId != null;
    document.body.style.overflow = locked ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showOrderForm, detailItemId]);

  // Ask the server whether this device may order. Optional coords feed the GPS
  // geofence. Fail open — a check error must never block a real customer.
  const checkGate = async (coords) => {
    try {
      const s = await fetchOrderGateStatus(coords);
      if (s.allowed) {
        setGate({ allowed: true, needLocation: false, tooFar: false, distance: null });
      } else if (s.needLocation && !coords) {
        setGate({ allowed: false, needLocation: true, tooFar: false, distance: null });
      } else {
        // blocked; if we already shared a location, it's a distance/other fail
        setGate({ allowed: false, needLocation: false, tooFar: !!coords && s.geoRequired, distance: s.distance ?? null });
      }
    } catch {
      setGate({ allowed: true, needLocation: false, tooFar: false, distance: null });
    }
  };

  // Customer taps "I'm at the café" → read GPS, re-check, remember for submit.
  const confirmLocation = async () => {
    setGeoErr('');
    setLocating(true);
    try {
      const loc = await getBrowserLocation();
      coordsRef.current = loc;
      await checkGate(loc);
    } catch {
      setGeoErr('Please allow location access, then tap again.');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    Promise.all([fetchMenu(), fetchTables()])
      .then(([m, t]) => { setMenu(m); setTables(t); })
      .catch(() => setMenu([]));

    checkGate(null); // first pass without location

    // live menu updates when the owner edits items
    const socket = getSocket();
    const refresh = () => fetchMenu().then(setMenu).catch(() => {});
    socket.on('menu:updated', refresh);
    return () => socket.off('menu:updated', refresh);
  }, []);

  const categories = useMemo(
    () => (menu ? ['All', ...new Set(menu.map((i) => i.category))] : ['All']),
    [menu]
  );
  const filteredMenu = useMemo(() => {
    if (!menu) return [];
    let list = activeCategory === 'All' ? menu : menu.filter((i) => i.category === activeCategory);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    return list;
  }, [activeCategory, menu, search]);
  const cartItems = useMemo(() => {
    if (!menu) return [];
    return Object.entries(cart).map(([id, qty]) => {
      const item = menu.find((m) => m.id === Number(id));
      return { id: Number(id), name: item?.name || '', qty, price: item?.price || 0 };
    });
  }, [cart, menu]);
  const total = cartItems.reduce((s, i) => s + i.qty * i.price, 0);
  const itemCount = cartItems.reduce((s, i) => s + i.qty, 0);

  const updateQty = (id, delta) => {
    setCart((p) => {
      const next = (p[id] || 0) + delta;
      if (next <= 0) {
        const { [id]: _, ...rest } = p;
        return rest;
      }
      return { ...p, [id]: Math.min(next, 20) };
    });
  };
  const removeItem = (id) => {
    setCart((p) => {
      const { [id]: _, ...rest } = p;
      return rest;
    });
  };

  // If the last line is removed inside the modal there is nothing to confirm.
  useEffect(() => {
    if (showOrderForm && cartItems.length === 0) setShowOrderForm(false);
  }, [showOrderForm, cartItems.length]);

  const submitOrder = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || submitting) return;
    if (!canOrder) {
      setError(
        gate.needLocation
          ? 'Please tap “I’m at the café” to share your location first.'
          : gate.tooFar
          ? 'You appear to be too far from the café to order.'
          : 'Ordering is only available inside the café. Please connect to the café Wi-Fi.'
      );
      return;
    }
    const takeaway = formData.orderType === 'takeaway';
    if (!takeaway && !formData.table) {
      setError('Please pick your table number');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const order = await placeOrder({
        name: formData.name,
        phone: formData.phone,
        orderType: formData.orderType,
        table: takeaway ? undefined : formData.table,
        note: formData.note,
        // include the last GPS fix so the server can verify the geofence
        ...(coordsRef.current ? { lat: coordsRef.current.lat, lng: coordsRef.current.lng } : {}),
        items: cartItems.map((i) => ({ menuItemId: i.id, qty: i.qty })),
      });
      try {
        localStorage.setItem('hcp_customer', JSON.stringify({ name: formData.name, phone: formData.phone }));
        localStorage.setItem('hcp_last_order', JSON.stringify({ code: order.publicCode, at: Date.now() }));
      } catch {}
      setCart({});
      setShowOrderForm(false);
      navigate(`/track/${order.publicCode}`);
    } catch (err) {
      // Server is the real gate — it may reject if the network/location changed.
      if (err.status === 403) checkGate(coordsRef.current);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!menu) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bean text-white">
        <div className="relative mb-6 items-center justify-center inline-block">
          <img src="../../resources/logo.png" alt="Logo" className='relative w-20 h-auto' />
          <h3 className="text-2xl mt-3 md:text-5xl font-bold handwritten">Folsom Cafe & Resturent</h3>
        </div>
        <div className="w-48 h-1 bg-white/20 rounded overflow-hidden">
          <div className="h-full w-1/2 bg-chiya animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto min-h-screen pb-28">
      <header className="bg-gradient-to-b from-espresso to-bean text-white p-10 rounded-b-[3rem] text-center relative shadow-xl">
        {trackable && (
          <button
            onClick={() => navigate(`/track/${trackable}`)}
            className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 rounded-full text-xs font-bold"
          >
            <Receipt size={14} /> My order
          </button>
        )}
        <div className="relative z-10">
          <div className="relative mb-3 mt-10 inline-block">
            <img src="../../resources/logo.png" alt="Logo" className='relative w-30 h-auto' />
          </div>
          <BlurText
            as="h1"
            text="Folsom Cafe & Resturent"
            className="text-2xl md:text-5xl font-bold handwritten block"
          />
          <p className="text-xs opacity-80 italic mt-0.5 mb-3">Ek Cup Chiya, Dherai Kura</p>
          {formData.table && (
            <p className="mt-3 inline-block bg-chiya px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
              Table {formData.table}
            </p>
          )}
        </div>
      </header>

      <nav className="sticky top-4 z-40 px-4 -mt-8 space-y-2">
        <div className="max-w-2xl mx-auto flex gap-3 overflow-x-auto scrollbar-hide bg-white/80 backdrop-blur-lg p-2 rounded-full shadow-lg border border-white/50">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-6 py-2 rounded-full font-bold text-sm transition-all ${
                activeCategory === cat ? 'bg-chiya text-white' : 'text-espresso hover:bg-cream'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="max-w-2xl mx-auto relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-espresso/40 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chiya, snacks…"
            className="w-full bg-white/80 backdrop-blur-lg border border-white/50 shadow rounded-full py-2.5 pl-10 pr-10 text-sm font-medium outline-none focus:ring-2 focus:ring-chiya/40"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-espresso/50 hover:bg-cream"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </nav>

      {!canOrder && (
        <div className="mx-4 mt-4 bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="bg-amber-400 text-white p-2 rounded-xl shrink-0">
            {gate.needLocation ? <Navigation size={20} /> : <Wifi size={20} />}
          </div>
          <div className="min-w-0">
            {gate.needLocation ? (
              <>
                <p className="font-black text-amber-800">Confirm you're at the café</p>
                <p className="text-sm font-bold text-amber-700 mt-0.5">
                  Share your location so we know you're here, then you can order. ☕
                </p>
                <button
                  onClick={confirmLocation}
                  disabled={locating}
                  className="mt-2.5 bg-espresso text-white px-4 py-2 rounded-xl font-black text-sm inline-flex items-center gap-2 disabled:opacity-60 active:scale-95 transition-all"
                >
                  {locating ? 'Checking…' : <><Navigation size={15} /> I'm at the café</>}
                </button>
                {geoErr && <p className="text-red-600 text-xs font-bold mt-2">{geoErr}</p>}
              </>
            ) : gate.tooFar ? (
              <>
                <p className="font-black text-amber-800">You seem too far from the café</p>
                <p className="text-sm font-bold text-amber-700 mt-0.5">
                  {gate.distance != null ? `You're about ${gate.distance} m away. ` : ''}
                  Please order from inside the café. You can still browse the menu below.
                </p>
              </>
            ) : (
              <>
                <p className="font-black text-amber-800">Ordering is for café guests</p>
                <p className="text-sm font-bold text-amber-700 mt-0.5">
                  Please connect to the café Wi-Fi to place an order. You can still browse the menu below. ☕
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <ClickSpark>
        <AnimatedList
          items={filteredMenu}
          keyOf={(item) => item.id}
          className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
          renderItem={(item) => (
            <MenuCard
              item={item}
              quantity={cart[item.id] || 0}
              onUpdateQuantity={updateQty}
              onOpenDetail={setDetailItemId}
            />
          )}
        />
        {!filteredMenu.length && (
          <div className="text-center text-gray-400 py-20">
            <Utensils size={48} className="mx-auto mb-4" />
            {search ? `Nothing matches “${search}”` : 'Coming Soon'}
          </div>
        )}
      </ClickSpark>

      {cartItems.length > 0 && !showOrderForm && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md">
          <ShinyButton
            onClick={() => setShowOrderForm(true)}
            className="w-full bg-chiya text-white p-4 rounded-2xl shadow-xl font-black"
          >
            <span className="flex w-full items-center justify-between">
              <span className="flex items-center gap-2">
                <ShoppingCart size={22} /> {itemCount} {itemCount === 1 ? 'item' : 'items'} · View order
              </span>
              <CountUp value={total} prefix="Rs. " />
            </span>
          </ShinyButton>
        </div>
      )}

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          quantity={cart[detailItem.id] || 0}
          onUpdateQuantity={updateQty}
          onClose={() => setDetailItemId(null)}
        />
      )}

      {showOrderForm && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center sm:px-4"
          onClick={() => setShowOrderForm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            <div className="sm:hidden w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black handwritten text-espresso flex items-center gap-2">
                <ClipboardList size={24} /> Your Order
              </h2>
              <button onClick={() => setShowOrderForm(false)} className="p-2 bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            {/* editable cart review — change your mind without leaving the sheet */}
            <div className="bg-cream rounded-2xl p-3 mb-4 space-y-1">
              {cartItems.map((it) => (
                <div key={it.id} className="flex items-center gap-2 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-bean truncate">{it.name}</p>
                    <p className="text-xs text-gray-500">Rs. {it.price} each</p>
                  </div>
                  <div className="flex items-center gap-1 bg-white rounded-full border border-latte/40 px-1">
                    <button
                      type="button"
                      onClick={() => updateQty(it.id, -1)}
                      className="p-1.5 text-espresso active:scale-90"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="font-black text-sm w-5 text-center">{it.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(it.id, 1)}
                      className="p-1.5 text-espresso active:scale-90"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="font-bold text-sm w-16 text-right">Rs. {it.qty * it.price}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(it.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 active:scale-90"
                    aria-label={`Remove ${it.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <div className="flex justify-between font-black border-t border-latte/40 pt-2 mt-1">
                <span>Total</span>
                <span>Rs. {total}</span>
              </div>
            </div>

            <form onSubmit={submitOrder} className="space-y-4">
              <input
                required
                placeholder="Name"
                maxLength={80}
                autoComplete="name"
                className="w-full p-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-chiya outline-none transition-all font-medium"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              />
              <input
                required
                type="tel"
                inputMode="tel"
                placeholder="Phone"
                maxLength={20}
                autoComplete="tel"
                pattern="[0-9+\-\s]{4,20}"
                title="Digits, +, - and spaces only"
                className="w-full p-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-chiya outline-none transition-all font-medium"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
              />

              {/* Dine-in at a table, or takeaway from the counter */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setFormData((p) => ({ ...p, orderType: 'dine' })); setError(''); }}
                  className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                    formData.orderType === 'dine'
                      ? 'bg-espresso text-white shadow-md'
                      : 'border-2 border-gray-100 hover:border-espresso/40'
                  }`}
                >
                  🪑 Dine in
                </button>
                <button
                  type="button"
                  onClick={() => { setFormData((p) => ({ ...p, orderType: 'takeaway' })); setError(''); }}
                  className={`py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                    formData.orderType === 'takeaway'
                      ? 'bg-espresso text-white shadow-md'
                      : 'border-2 border-gray-100 hover:border-espresso/40'
                  }`}
                >
                  🥡 Takeaway
                </button>
              </div>

              {formData.orderType === 'dine' ? (
                <div className={qrTable ? '' : 'grid grid-cols-5 gap-2'}>
                  <p className={qrTable ? 'text-center font-bold' : 'col-span-5 text-center font-bold'}>
                    Table No.
                  </p>
                  {qrTable ? (
                    <div className="mt-2 bg-chiya text-white rounded-lg py-2.5 text-center font-bold">
                      {qrTable}
                      <span className="block text-[10px] uppercase tracking-wider opacity-80">Locked from QR</span>
                    </div>
                  ) : tables.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setFormData((p) => ({ ...p, table: t })); setError(''); }}
                      className={`py-2.5 rounded-lg font-bold transition-all active:scale-95 ${
                        formData.table === t
                          ? 'bg-chiya text-white shadow-md'
                          : 'border-2 border-gray-100 hover:border-chiya/40'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs font-bold text-gray-400 bg-cream rounded-xl py-3">
                  You'll get a pickup token — collect at the counter when it's ready.
                </p>
              )}

              <textarea
                placeholder="Note for the kitchen (optional — e.g. less sugar)"
                maxLength={500}
                className="w-full p-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-chiya outline-none transition-all font-medium h-20"
                value={formData.note}
                onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
              />

              {!canOrder && (
                <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl py-2.5 px-3 text-xs font-bold text-center">
                  {gate.needLocation ? (
                    <button
                      type="button"
                      onClick={confirmLocation}
                      disabled={locating}
                      className="inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                      <Navigation size={14} /> {locating ? 'Checking…' : "Tap to confirm you're at the café"}
                    </button>
                  ) : gate.tooFar ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Navigation size={14} /> You seem too far from the café to order
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Wifi size={14} /> Connect to the café Wi-Fi to place this order
                    </span>
                  )}
                </div>
              )}
              {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}

              <ShinyButton
                type="submit"
                disabled={submitting || !canOrder}
                className="w-full bg-espresso text-white py-4 rounded-xl font-black disabled:opacity-60"
              >
                <CheckCircle2 size={20} /> {submitting ? 'Placing…' : `Confirm · Rs. ${total}`}
              </ShinyButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerView;
