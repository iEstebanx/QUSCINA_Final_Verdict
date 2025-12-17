/* QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Print/KitchenPrint.css */
import { useEffect } from "react";
import "./kot.css";

function fmtDateTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function KitchenPrinter({ order }) {
  useEffect(() => {
    // let layout settle before printing
    const t = setTimeout(() => {
      try {
        window.print();
      } finally {
        setTimeout(() => window.close(), 250);
      }
    }, 200);

    return () => clearTimeout(t);
  }, []);

  return (
    <div className="kot">
      <div className="kot__header">
        <div className="kot__title">KITCHEN ORDER</div>
        <div className="kot__meta">
          <div><strong>Order:</strong> {order.orderNo ? `#${order.orderNo}` : `#${order.id}`}</div>
          {order.type ? <div><strong>Type:</strong> {order.type}</div> : null}
          {order.table ? <div><strong>Table:</strong> {order.table}</div> : null}
          {order.customer ? <div><strong>Customer:</strong> {order.customer}</div> : null}
          <div><strong>Date:</strong> {fmtDateTime(order.createdAt)}</div>
        </div>
      </div>

      <div className="kot__divider" />

      <div className="kot__items">
        {order.items?.length ? (
          order.items.map((it) => (
            <div className="kot__item" key={String(it.id ?? it.name)}>
              <div className="kot__qty">{it.qty}x</div>
              <div className="kot__name">{it.name}</div>
            </div>
          ))
        ) : (
          <div className="kot__empty">No items</div>
        )}
      </div>

      <div className="kot__divider" />
      <div className="kot__footer">— END —</div>
    </div>
  );
}