import { formatDateTime } from './format';
import { CAFE_NAME, PLATFORM_NAME } from './brand';

const escapeHtml = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

// Every interpolated value is escaped — order.name/note are customer input.
export function printBill(order) {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;

  const rows = order.items
    .map(
      (it) => `
        <tr>
          <td>${escapeHtml(it.name)}</td>
          <td class="qty">${escapeHtml(it.qty)}</td>
          <td class="amount">Rs. ${escapeHtml(it.qty * it.price)}</td>
        </tr>`
    )
    .join('');

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(CAFE_NAME)} - Bill ${escapeHtml(order.publicCode)}</title>
  <style>
    body { font-family: 'Courier New', monospace; padding: 20px; color: #000; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 10px; }
    .header h1 { font-size: 22px; margin: 0; }
    .header p { font-size: 12px; margin: 0; }
    .details { margin: 10px 0; font-size: 13px; }
    .details p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 6px 0; text-align: left; }
    th { border-bottom: 1px dashed #000; }
    td.qty, td.amount, th.qty, th.amount { text-align: center; }
    .total-row { border-top: 2px solid #000; margin-top: 5px; padding-top: 5px; font-weight: bold; font-size: 16px; }
    .footer { text-align: center; font-size: 11px; border-top: 1px dashed #ccc; margin-top: 15px; padding-top: 5px; font-style: italic; }
    @media print { body { width: 100%; padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(CAFE_NAME)}</h1>
    <p>"Ek Cup Chiya, Dherai Kura"</p>
  </div>
  <div class="details">
    <p><b>BILL ID:</b> ${escapeHtml(order.publicCode)}</p>
    <p><b>Customer:</b> ${escapeHtml(order.name || 'N/A')}</p>
    <p><b>Contact:</b> ${escapeHtml(order.phone || 'N/A')}</p>
    <p><b>Table:</b> ${escapeHtml(order.table)}</p>
    <p><b>Time:</b> ${escapeHtml(formatDateTime(order.createdAt))}</p>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="qty">Qty</th><th class="amount">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total-row">TOTAL: Rs. ${escapeHtml(order.total)}</div>
  <div class="footer">Visit again soon! · Powered by ${PLATFORM_NAME}™</div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
</body>
</html>`);
  w.document.close();
}

const METHOD_LABELS = {
  cash: 'Cash', esewa: 'eSewa', khalti: 'Khalti', fonepay: 'Fonepay', card: 'Card', credit: 'Udhaaro (credit)',
};

// Combined receipt for a whole table's tab: every unpaid order merged into one
// bill. `payment` is optional — present after settling (method + who took it).
export function printTableBill(bill, payment) {
  const w = window.open('', '_blank', 'width=400,height=600');
  if (!w) return;

  const sections = bill.orders
    .map(
      (o) => `
        <tr class="order-head"><td colspan="3">${escapeHtml(o.publicCode)} — ${escapeHtml(o.name)}</td></tr>
        ${o.items
          .map(
            (it) => `
        <tr>
          <td>${escapeHtml(it.name)}</td>
          <td class="qty">${escapeHtml(it.qty)}</td>
          <td class="amount">Rs. ${escapeHtml(it.qty * it.price)}</td>
        </tr>`
          )
          .join('')}`
    )
    .join('');

  w.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${escapeHtml(CAFE_NAME)} - Table ${escapeHtml(bill.tableNo)} Bill</title>
  <style>
    body { font-family: 'Courier New', monospace; padding: 20px; color: #000; background: #fff; }
    .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 10px; }
    .header h1 { font-size: 22px; margin: 0; }
    .header p { font-size: 12px; margin: 0; }
    .details { margin: 10px 0; font-size: 13px; }
    .details p { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { padding: 6px 0; text-align: left; }
    th { border-bottom: 1px dashed #000; }
    td.qty, td.amount, th.qty, th.amount { text-align: center; }
    tr.order-head td { border-top: 1px dashed #000; font-size: 11px; font-weight: bold; padding-top: 8px; }
    .adjust { font-size: 13px; border-top: 1px dashed #000; padding-top: 4px; }
    .adjust p { display: flex; justify-content: space-between; margin: 2px 0; }
    .total-row { border-top: 2px solid #000; margin-top: 5px; padding-top: 5px; font-weight: bold; font-size: 16px; }
    .paid { text-align: center; font-weight: bold; font-size: 13px; margin-top: 8px; border: 2px solid #000; padding: 4px; }
    .footer { text-align: center; font-size: 11px; border-top: 1px dashed #ccc; margin-top: 15px; padding-top: 5px; font-style: italic; }
    @media print { body { width: 100%; padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(CAFE_NAME)}</h1>
    <p>"Ek Cup Chiya, Dherai Kura"</p>
  </div>
  <div class="details">
    <p><b>Table:</b> ${escapeHtml(bill.tableNo)}</p>
    <p><b>Orders:</b> ${escapeHtml(bill.orders.length)}</p>
    <p><b>Time:</b> ${escapeHtml(formatDateTime(payment?.createdAt || new Date().toISOString()))}</p>
  </div>
  <table>
    <thead><tr><th>Item</th><th class="qty">Qty</th><th class="amount">Amount</th></tr></thead>
    <tbody>${sections}</tbody>
  </table>
  ${
    payment && (payment.discount > 0 || payment.extraCharge > 0)
      ? `<div class="adjust">
          <p><span>Subtotal</span><span>Rs. ${escapeHtml(payment.subtotal)}</span></p>
          ${payment.discount > 0 ? `<p><span>Discount</span><span>- Rs. ${escapeHtml(payment.discount)}</span></p>` : ''}
          ${payment.extraCharge > 0 ? `<p><span>Extra charge</span><span>+ Rs. ${escapeHtml(payment.extraCharge)}</span></p>` : ''}
        </div>`
      : ''
  }
  <div class="total-row">TOTAL: Rs. ${escapeHtml(payment?.total ?? bill.total)}</div>
  ${
    payment
      ? `<div class="paid">PAID — ${escapeHtml(METHOD_LABELS[payment.method] || payment.method)}${
          payment.takenBy ? ` (by ${escapeHtml(payment.takenBy)})` : ''
        }</div>`
      : ''
  }
  <div class="footer">Visit again soon! · Powered by ${PLATFORM_NAME}™</div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
</body>
</html>`);
  w.document.close();
}
