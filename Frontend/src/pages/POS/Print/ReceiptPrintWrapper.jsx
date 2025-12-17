// QUSCINA_BACKOFFICE/Frontend/src/pages/POS/Print/ReceiptPrintWrapper.jsx
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "@/utils/apiBase";
import Printer from "./Printer";

export default function ReceiptPrintWrapper() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!orderId) return;

    const base = API_BASE || "";
    const url = base
      ? base.endsWith("/api")
        ? `${base}/pos/orders/${orderId}`
        : `${base}/api/pos/orders/${orderId}`
      : `/api/pos/orders/${orderId}`;

    axios
      .get(url, { withCredentials: true })
      .then((res) => {
        if (!res.data?.ok || !res.data.order) return;

        const src = res.data.order;

        setOrder({
          id: src.id,
          orderNo: src.orderNo,
          orderType: src.orderType,
          employee: src.employee,
          closedAt: src.closedAt,
          items: src.items.map((i) => ({
            id: i.lineId,
            name: i.name,
            qty: i.qty,
            price: i.price,
            total: i.qty * i.price,
          })),
          total: src.netAmount,
        });
      })
      .catch(console.error);
  }, [orderId]);

  if (!order) return null;
  return <Printer order={order} />;
}