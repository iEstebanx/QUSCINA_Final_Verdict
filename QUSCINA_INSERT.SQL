-- USER ROLES
INSERT IGNORE INTO user_roles (role_code, display_name) VALUES
('Admin','Admin'),
('Manager','Manager'),
('Cashier','Cashier'),
('Chef','Chef');

-- EMPLOYEE STATUS
INSERT IGNORE INTO employees_status (status_code) VALUES
('Active'),('Inactive');

-- TABLE SESSION SOURCE
INSERT IGNORE INTO table_sessions_source (source_code) VALUES
('walk_in'),('reservation');

-- TABLE SESSION STATUS
INSERT IGNORE INTO table_sessions_status (status_code) VALUES
('open'),('closed'),('cancelled'),('merged'),('transferred');

-- RESERVATION STATUS
INSERT IGNORE INTO reservations_status (status_code) VALUES
('pending'),('confirmed'),('seated'),('cancelled'),('no_show'),('completed');

-- SELF-ORDER SESSION STATUS
INSERT IGNORE INTO self_order_sessions_status (status_code) VALUES
('active'),('expired'),('closed'),('cancelled');

-- SELF-ORDER PAYMENT POLICY
INSERT IGNORE INTO self_order_sessions_payment_policy (policy_code) VALUES
('pay_at_counter'),('pay_at_table');

-- SHIFT STATUS
INSERT IGNORE INTO shifts_status (status_code) VALUES
('open'),('closed'),('reconciled'),('archived');

-- ORDER SOURCE
INSERT IGNORE INTO orders_source (source_code) VALUES
('pos_order'),('self_order');

-- ORDER STATUS
INSERT IGNORE INTO orders_status (status_code) VALUES
('draft'),('placed'),('preparing'),('served'),('voided'),('paid'),('refunded'),('closed');

-- ORDER ITEM STATUS
INSERT IGNORE INTO order_items_status (status_code) VALUES
('ordered'),('preparing'),('served'),('voided'),('refunded');

-- DISCOUNT TYPE (expand beyond percent as you asked earlier)
INSERT IGNORE INTO discounts_type (type_code) VALUES
('percent'),('fixed'),('bogo'),('service_charge_waiver');

-- PAYMENT STATUS
INSERT IGNORE INTO payments_status (status_code) VALUES
('pending'),('captured'),('failed'),('voided'),('refunded'),('cancelled');

-- REFUND REASONS
INSERT IGNORE INTO refunds_reason (reason_code) VALUES
('customer_request'),('order_error'),('payment_error'),('item_unavailable'),('other');

-- CASH DRAWER TXN TYPE
INSERT IGNORE INTO cash_drawer_transactions_type (type_code) VALUES
('cash_in'),('cash_out'),('payout'),('safe_drop'),('adjustment');

-- INVENTORY MOVEMENT TYPE
INSERT IGNORE INTO inventory_movements_type (type_code) VALUES
('consume'),('wastage'),('adjustment'),('refund'),('transfer_in'),('transfer_out'),('production');