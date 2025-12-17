// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Print/Printer.jsx
import { useEffect, useMemo } from "react";
import "./PrintReceipt.css";
import logo from "@/assets/LOGO.png";

const PHP = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function Printer({ order }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
      window.close();
    }, 300);
    return () => clearTimeout(t);
  }, []);

  const { dateStr, timeStr } = useMemo(() => {
    const d = new Date(order?.closedAt || Date.now());
    return {
      dateStr: d.toLocaleDateString("en-PH"),
      timeStr: d.toLocaleTimeString("en-PH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }, [order?.closedAt]);

  return (
    <div className="receipt">
      {/* Header */}
      <div className="receipt__header">
        <img src={logo} className="receipt__logo" alt="Quscina Cafe" />
        <div className="receipt__store">QUSCINA CAFE</div>
        {/* optional sub line */}
        <div className="receipt__sub">Official Receipt</div>
      </div>

      {/* Meta */}
      <div className="receipt__meta">
        <div className="meta-row">
          <span className="k">Order</span>
          <span className="v">#{order?.orderNo ?? "-"}</span>
        </div>
        <div className="meta-row">
          <span className="k">Date</span>
          <span className="v">
            {dateStr} {timeStr}
          </span>
        </div>
        <div className="meta-row">
          <span className="k">Cashier</span>
          <span className="v">{order?.employee ?? "-"}</span>
        </div>
      </div>

      <div className="hr hr--thin" />

      {/* Items */}
      <div className="items">
        {(order?.items || []).map((i, idx) => {
          const qty = Number(i.qty ?? i.quantity ?? 1);
          const name = i.name ?? i.productName ?? "";
          const lineTotal =
            Number(i.total ?? i.lineTotal ?? (Number(i.price || 0) * qty)) || 0;

          return (
            <div key={i.id ?? `${name}-${idx}`} className="item">
              <div className="item__top">
                <div className="item__name">
                  {name} <span className="muted">x {qty}</span>
                </div>
                <div className="item__price">{PHP(lineTotal)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hr" />

      {/* Total */}
      <div className="totals">
        <div className="total-row total-row--grand">
          <span className="label">TOTAL</span>
          <span className="value">{PHP(order?.total ?? 0)}</span>
        </div>
      </div>

      <div className="receipt__footer">
        <div className="thanks">Thank you!</div>
        <div className="note">Please come again.</div>
      </div>
    </div>
  );
}