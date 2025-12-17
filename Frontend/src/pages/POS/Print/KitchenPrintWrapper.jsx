/* QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Print/KitchenPrintWrapper.css */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "@/utils/apiBase";
import KitchenPrinter from "./KitchenPrint";
import "./kot.css";

// Backoffice POS helper (matches your Cart.jsx)
const ordersApi = (subPath = "") => {
  const base = API_BASE || "";
  const clean = subPath.startsWith("/") ? subPath : `/${subPath}`;
  if (!base) return `/api/pos/orders${clean}`;
  if (base.endsWith("/api")) return `${base}/pos/orders${clean}`;
  return `${base}/api/pos/orders${clean}`;
};

export default function KitchenPrintWrapper() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(ordersApi(`/${encodeURIComponent(orderId)}`), {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(data.error || `Failed (${res.status})`);

        // Your /api/pos/orders/:id might return {order:{...}} or just the order shape.
        const o = data.order || data;

        // Field fallbacks (keep it resilient)
        const orderNo = o.orderNo ?? o.order_no ?? o.order_number ?? "";
        const type = o.orderType ?? o.order_type ?? o.type ?? "";
        const table =
          o.tableNo ?? o.table_no ?? o.table ?? o.tableNumber ?? o.table_number ?? "";
        const customer =
          o.customerName ?? o.customer_name ?? o.customer ?? o.customer_name ?? "Walk-in";
        const createdAt = o.time ?? o.createdAt ?? o.created_at ?? new Date().toISOString();

        const itemsRaw = Array.isArray(o.items) ? o.items : [];
        const items = itemsRaw
          .map((it) => {
            const qty = Number(it.qty ?? it.quantity ?? 1) || 0;
            const voided = Number(it.voided_qty ?? it.voidedQty ?? 0) || 0;
            const netQty = Math.max(0, qty - voided);

            return {
              id: it.id ?? it.itemId ?? it.order_item_id,
              name: it.name ?? it.itemName ?? "Item",
              qty: netQty,
            };
          })
          .filter((it) => it.qty > 0);

        const mapped = { id: orderId, orderNo, type, table, customer, createdAt, items };

        if (!cancelled) setOrder(mapped);
      } catch (e) {
        console.error("[KitchenPrintWrapper]", e);
        if (!cancelled) setOrder({ id: orderId, orderNo: "", type: "", table: "", customer: "", createdAt: "", items: [] });
        // (Optional) you can render an error message instead, but printing usually just needs “best effort”
      }
    }

    if (orderId) load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!order) return null;
  return <KitchenPrinter order={order} />;
}