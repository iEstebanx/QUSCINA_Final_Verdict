// QUSCINA_BACKOFFICE/Frontend/src/context/CartContext.jsx
import { createContext, useContext, useState, useEffect, useMemo } from "react";
import PropTypes from "prop-types";

const CartContext = createContext();

export function CartProvider({ children }) {
  // --- Items ---------------------------------------------------------------
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cartItems")) ?? [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("cartItems", JSON.stringify(items));
  }, [items]);

  // Add or increment product (MenuPage will call this)
  const addItem = (item) => {
    setItems((prev) => {
      const hit = prev.find((i) => i.id === item.id);
      if (hit) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i
        );
      }
      // keep a consistent shape: {id, name, price, image?, quantity}
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

  const clearCart = () => setItems([]);

  // Set exact quantity (used by +/- in Cart)
  const setItemQuantity = (id, qty) => {
    const q = Math.max(1, Number(qty) || 1);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: q } : i)));
  };

  const incrementItem = (id) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i))
    );

  const decrementItem = (id) =>
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, quantity: Math.max(1, (i.quantity ?? 1) - 1) } : i
      )
    );

  // --- View (shared with Menu/Cart so layout stays in sync) ---------------
  const [viewMode, setViewMode] = useState("text"); // "text" | "image"

  // --- Discounts -----------------------------------------------------------
  // Business rule: ONLY ONE active discount is stored.
  // We still use an array for compatibility with Cart.jsx (index 0 only).
  const [discounts, setDiscounts] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("cartDiscounts")) ?? [];
      if (!Array.isArray(raw)) return [];
      return raw.length > 0 ? [raw[0]] : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const toStore = discounts.length > 0 ? [discounts[0]] : [];
    localStorage.setItem("cartDiscounts", JSON.stringify(toStore));
  }, [discounts]);

  const activeDiscount = discounts[0] || null;

  const applyDiscount = (name, percent) => {
    const pct = Math.max(0, Number(percent) || 0);
    const normalizedName = String(name ?? "").trim() || "Discount";
    setDiscounts([{ name: normalizedName, percent: pct }]);
  };

  const updateDiscount = (index, patch) =>
    setDiscounts((prev) => {
      if (index !== 0 || !prev[0]) return prev;
      const next = [...prev];
      next[0] = { ...next[0], ...patch };
      return next;
    });

  const removeDiscount = (index) => setDiscounts((prev) => (index === 0 ? [] : prev));

  const clearDiscounts = () => setDiscounts([]);

  // ---------------- Per-item discounts (Backoffice) ----------------
  const [itemDiscounts, setItemDiscounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("cartItemDiscounts")) ?? {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("cartItemDiscounts", JSON.stringify(itemDiscounts));
  }, [itemDiscounts]);

  // disc shape: { name, percent, code? } ; pass null/undefined to delete
  const setItemDiscount = (itemId, disc) => {
    const key = String(itemId);
    setItemDiscounts((prev) => {
      const next = { ...prev };
      if (!disc) delete next[key];
      else {
        next[key] = {
          name: String(disc.name ?? "Discount").trim() || "Discount",
          percent: Number(disc.percent) || 0,
          code: disc.code ?? undefined,
        };
      }
      return next;
    });
  };

  const clearItemDiscounts = () => setItemDiscounts({});

  // --- Totals --------------------------------------------------------------
  const subtotal = items.reduce(
    (acc, i) => acc + (i.price || 0) * (i.quantity ?? 1),
    0
  );

  const totalPercent = activeDiscount ? Math.max(0, Number(activeDiscount.percent) || 0) : 0;
  const discountAmount = (subtotal * totalPercent) / 100;

  // per-item discount peso value
  const itemDiscountAmount = items.reduce((sum, it) => {
    const qty = it.quantity ?? 1;
    const line = (Number(it.price) || 0) * qty;

    const disc = itemDiscounts[String(it.id)];
    const pct = disc ? Math.max(0, Number(disc.percent) || 0) : 0;

    return sum + (line * pct) / 100;
  }, 0);

  const value = useMemo(
    () => ({
      // items
      items,
      addItem,
      removeItem,
      clearCart,
      setItemQuantity,
      incrementItem,
      decrementItem,

      // discounts
      discounts,
      activeDiscount,
      applyDiscount,
      updateDiscount,
      removeDiscount,
      clearDiscounts,

      // per-item discounts
      itemDiscounts,
      setItemDiscount,
      clearItemDiscounts,
      itemDiscountAmount,

      // totals/view
      subtotal,
      discountAmount,
      viewMode,
      setViewMode,
    }),
    [
      items,
      subtotal,
      discountAmount,
      discounts,
      activeDiscount,
      viewMode,
      itemDiscounts,
      itemDiscountAmount,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

CartProvider.propTypes = { children: PropTypes.node.isRequired };

export function useCart() {
  return useContext(CartContext);
}