-- =========================================================
-- Point-of-Sale / Restaurant DB (MySQL 8+)
-- Engine/charset defaults
-- =========================================================
CREATE DATABASE IF NOT EXISTS QUSCINA CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE QUSCINA;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

-- =========================================================
-- 0) Utility: consistent timestamp defaults
-- =========================================================
-- Note: HeidiSQL/MySQL 8 supports CURRENT_TIMESTAMP(3) for ms precision

-- =========================================================
-- 1) LOOKUP TABLES (normalize “ENUMs” you listed)
-- =========================================================
CREATE TABLE user_roles (
  role_code       VARCHAR(32)  PRIMARY KEY,   -- e.g., 'Admin','Manager','Cashier','Chef'
  display_name    VARCHAR(64)  NOT NULL
) ENGINE=InnoDB;

CREATE TABLE employees_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'Active','Inactive'
) ENGINE=InnoDB;

CREATE TABLE table_sessions_source (
  source_code     VARCHAR(32)  PRIMARY KEY    -- 'walk_in','reservation'
) ENGINE=InnoDB;

CREATE TABLE table_sessions_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'open','closed','cancelled','merged','transferred'
) ENGINE=InnoDB;

CREATE TABLE reservations_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'pending','confirmed','seated','cancelled','no_show','completed'
) ENGINE=InnoDB;

CREATE TABLE self_order_sessions_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'active','expired','closed','cancelled'
) ENGINE=InnoDB;

CREATE TABLE self_order_sessions_payment_policy (
  policy_code     VARCHAR(32)  PRIMARY KEY    -- 'pay_at_counter','pay_at_table'
) ENGINE=InnoDB;

CREATE TABLE shifts_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'open','closed','reconciled','archived'
) ENGINE=InnoDB;

CREATE TABLE orders_source (
  source_code     VARCHAR(32)  PRIMARY KEY    -- 'pos_order','self_order'
) ENGINE=InnoDB;

CREATE TABLE orders_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'draft','placed','preparing','served','voided','paid','refunded','closed'
) ENGINE=InnoDB;

CREATE TABLE order_items_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'ordered','preparing','served','voided','refunded'
) ENGINE=InnoDB;

CREATE TABLE discounts_type (
  type_code       VARCHAR(32)  PRIMARY KEY    -- 'percent'
) ENGINE=InnoDB;

CREATE TABLE payments_status (
  status_code     VARCHAR(32)  PRIMARY KEY    -- 'pending','captured','failed','voided','refunded','cancelled'
) ENGINE=InnoDB;

CREATE TABLE refunds_reason (
  reason_code     VARCHAR(32)  PRIMARY KEY    -- 'customer_request','order_error','payment_error','item_unavailable','other'
) ENGINE=InnoDB;

CREATE TABLE cash_drawer_transactions_type (
  type_code       VARCHAR(32)  PRIMARY KEY    -- 'cash_in','cash_out','payout','safe_drop','adjustment'
) ENGINE=InnoDB;

CREATE TABLE inventory_movements_type (
  type_code       VARCHAR(32)  PRIMARY KEY    -- 'consume','wastage','adjustment','refund','transfer_in','transfer_out','production'
) ENGINE=InnoDB;

-- =========================================================
-- 2) CORE ENTITIES
-- =========================================================
CREATE TABLE employees (
  employee_id     CHAR(9)      PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL UNIQUE, -- added for login or identification
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  email           VARCHAR(255) UNIQUE,
  password_hash   VARCHAR(255),
  pin_hash        VARCHAR(255),
  phone           VARCHAR(50),
  role_code       VARCHAR(32)  NOT NULL,
  status_code     VARCHAR(32)  NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at      DATETIME(3)  NULL,
  CONSTRAINT fk_employees_role      FOREIGN KEY (role_code)   REFERENCES user_roles(role_code),
  CONSTRAINT fk_employees_status    FOREIGN KEY (status_code) REFERENCES employees_status(status_code)
) ENGINE=InnoDB;

CREATE TABLE categories (
  category_id     BIGINT       PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(150) NOT NULL,
  sort_order      INT          NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  menu_item_id        BIGINT       PRIMARY KEY AUTO_INCREMENT,
  category_id         BIGINT       NOT NULL,
  name                VARCHAR(200) NOT NULL,
  sku                 VARCHAR(100) UNIQUE,
  price_minor         INT          NOT NULL,      -- store in minor units (e.g., cents)
  is_tax_included     TINYINT(1)   NOT NULL DEFAULT 0,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  description         TEXT,
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_menu_items_category FOREIGN KEY (category_id) REFERENCES categories(category_id)
) ENGINE=InnoDB;

CREATE TABLE dining_areas (
  area_id        BIGINT       PRIMARY KEY AUTO_INCREMENT,
  name           VARCHAR(150) NOT NULL,
  sort_order     INT          NOT NULL DEFAULT 0,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE tables (
  table_id       BIGINT       PRIMARY KEY AUTO_INCREMENT,
  area_id        BIGINT       NOT NULL,
  label          VARCHAR(50)  NOT NULL,
  capacity       INT          NOT NULL DEFAULT 1,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tables_area_label (area_id, label),
  CONSTRAINT fk_tables_area FOREIGN KEY (area_id) REFERENCES dining_areas(area_id)
) ENGINE=InnoDB;

CREATE TABLE qr_tables (
  qr_id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
  table_id       BIGINT       NOT NULL,
  token          VARCHAR(255) NOT NULL UNIQUE,
  expires_at     DATETIME(3),
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_qr_tables_table FOREIGN KEY (table_id) REFERENCES tables(table_id)
) ENGINE=InnoDB;

CREATE TABLE reservations (
  reservation_id   BIGINT       PRIMARY KEY AUTO_INCREMENT,
  customer_name    VARCHAR(150) NOT NULL,
  phone            VARCHAR(50),
  pax              INT          NOT NULL,
  reservation_time DATETIME(3)  NOT NULL,
  status_code      VARCHAR(32)  NOT NULL,  -- reservations_status
  notes            TEXT,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_reservations_status FOREIGN KEY (status_code) REFERENCES reservations_status(status_code)
) ENGINE=InnoDB;

-- Junction assigning one reservation to multiple tables
CREATE TABLE table_reservations (
  reservation_id BIGINT NOT NULL,
  table_id       BIGINT NOT NULL,
  PRIMARY KEY (reservation_id, table_id),
  CONSTRAINT fk_tbl_res_res     FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id) ON DELETE CASCADE,
  CONSTRAINT fk_tbl_res_table   FOREIGN KEY (table_id)       REFERENCES tables(table_id)          ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE table_sessions (
  table_session_id   CHAR(36)    PRIMARY KEY,  -- store UUID as 36-char
  table_id           BIGINT      NOT NULL,
  reservation_id     BIGINT      NULL,
  started_at         DATETIME(3) NOT NULL,
  ended_at           DATETIME(3) NULL,
  pax                INT         NOT NULL,
  customer_name      VARCHAR(150),
  source_code        VARCHAR(32) NOT NULL,   -- table_sessions_source
  status_code        VARCHAR(32) NOT NULL,   -- table_sessions_status
  created_by         CHAR(9)     NOT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_table_sessions_table (table_id),
  KEY ix_table_sessions_res   (reservation_id),
  CONSTRAINT fk_tbl_sessions_table    FOREIGN KEY (table_id)       REFERENCES tables(table_id),
  CONSTRAINT fk_tbl_sessions_res      FOREIGN KEY (reservation_id) REFERENCES reservations(reservation_id),
  CONSTRAINT fk_tbl_sessions_source   FOREIGN KEY (source_code)    REFERENCES table_sessions_source(source_code),
  CONSTRAINT fk_tbl_sessions_status   FOREIGN KEY (status_code)    REFERENCES table_sessions_status(status_code),
  CONSTRAINT fk_tbl_sessions_creator  FOREIGN KEY (created_by)     REFERENCES employees(employee_id)
) ENGINE=InnoDB;

CREATE TABLE self_order_sessions (
  self_order_session_id CHAR(36)    PRIMARY KEY,
  qr_id                 BIGINT      NOT NULL,
  table_session_id      CHAR(36)    NULL,
  client_fingerprint    VARCHAR(255),
  status_code           VARCHAR(32) NOT NULL,  -- self_order_sessions_status
  started_at            DATETIME(3) NOT NULL,
  ended_at              DATETIME(3),
  policy_code           VARCHAR(32) NOT NULL,  -- self_order_sessions_payment_policy
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sos_qr        FOREIGN KEY (qr_id)            REFERENCES qr_tables(qr_id),
  CONSTRAINT fk_sos_table_ses  FOREIGN KEY (table_session_id) REFERENCES table_sessions(table_session_id),
  CONSTRAINT fk_sos_status     FOREIGN KEY (status_code)      REFERENCES self_order_sessions_status(status_code),
  CONSTRAINT fk_sos_policy     FOREIGN KEY (policy_code)      REFERENCES self_order_sessions_payment_policy(policy_code)
) ENGINE=InnoDB;

CREATE TABLE terminals (
  terminal_id   BIGINT       PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  device_uid    VARCHAR(100) UNIQUE,
  location_note VARCHAR(255),
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE shifts (
  shift_id             BIGINT      PRIMARY KEY AUTO_INCREMENT,
  terminal_id          BIGINT      NOT NULL,
  opened_by            CHAR(9)     NOT NULL,
  closed_by            CHAR(9)     NULL,
  opened_at            DATETIME(3) NOT NULL,
  closed_at            DATETIME(3) NULL,
  opening_cash_minor   INT         NOT NULL DEFAULT 0,
  closing_cash_minor   INT         NULL,
  expected_cash_minor  INT         NULL,
  variance_minor       INT         NULL,
  status_code          VARCHAR(32) NOT NULL, -- shifts_status
  notes                TEXT,
  created_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_shifts_terminal (terminal_id),
  CONSTRAINT fk_shifts_terminal  FOREIGN KEY (terminal_id) REFERENCES terminals(terminal_id),
  CONSTRAINT fk_shifts_opened_by FOREIGN KEY (opened_by)   REFERENCES employees(employee_id),
  CONSTRAINT fk_shifts_closed_by FOREIGN KEY (closed_by)   REFERENCES employees(employee_id),
  CONSTRAINT fk_shifts_status    FOREIGN KEY (status_code) REFERENCES shifts_status(status_code)
) ENGINE=InnoDB;

CREATE TABLE denominations (
  denom_code   VARCHAR(32) PRIMARY KEY,  -- e.g., 'PHP1000','PHP500', etc.
  value_minor  INT         NOT NULL,     -- face value in minor units
  label        VARCHAR(64) NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE shift_denominations (
  shift_id     BIGINT       NOT NULL,
  denom_code   VARCHAR(32)  NOT NULL,
  qty_open     INT          NOT NULL DEFAULT 0,
  qty_close    INT          NULL,
  PRIMARY KEY (shift_id, denom_code),
  CONSTRAINT fk_shift_denoms_shift FOREIGN KEY (shift_id)   REFERENCES shifts(shift_id)       ON DELETE CASCADE,
  CONSTRAINT fk_shift_denoms_denom FOREIGN KEY (denom_code) REFERENCES denominations(denom_code)
) ENGINE=InnoDB;

CREATE TABLE orders (
  order_id              BIGINT       PRIMARY KEY AUTO_INCREMENT,
  table_session_id      CHAR(36)     NULL,
  shift_id              BIGINT       NULL,
  terminal_id           BIGINT       NULL,
  source_code           VARCHAR(32)  NOT NULL, -- orders_source
  status_code           VARCHAR(32)  NOT NULL, -- orders_status
  subtotal_minor        INT          NOT NULL DEFAULT 0,
  discount_total_minor  INT          NOT NULL DEFAULT 0,
  tax_minor             INT          NOT NULL DEFAULT 0,
  service_charge_minor  INT          NOT NULL DEFAULT 0,
  total_minor           INT          NOT NULL DEFAULT 0,
  notes                 TEXT,
  placed_by             CHAR(9)      NULL,
  placed_at             DATETIME(3)  NULL,
  created_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_orders_table_session (table_session_id),
  KEY ix_orders_shift (shift_id),
  KEY ix_orders_terminal (terminal_id),
  CONSTRAINT fk_orders_table_session FOREIGN KEY (table_session_id) REFERENCES table_sessions(table_session_id),
  CONSTRAINT fk_orders_shift         FOREIGN KEY (shift_id)         REFERENCES shifts(shift_id),
  CONSTRAINT fk_orders_terminal      FOREIGN KEY (terminal_id)      REFERENCES terminals(terminal_id),
  CONSTRAINT fk_orders_source        FOREIGN KEY (source_code)      REFERENCES orders_source(source_code),
  CONSTRAINT fk_orders_status        FOREIGN KEY (status_code)      REFERENCES orders_status(status_code),
  CONSTRAINT fk_orders_placed_by     FOREIGN KEY (placed_by)        REFERENCES employees(employee_id)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  order_item_id        BIGINT       PRIMARY KEY AUTO_INCREMENT,
  order_id             BIGINT       NOT NULL,
  menu_item_id         BIGINT       NOT NULL,
  qty                  DECIMAL(12,3) NOT NULL DEFAULT 1.000,
  unit_price_minor     INT          NOT NULL,
  line_discount_minor  INT          NOT NULL DEFAULT 0,
  line_total_minor     INT          NOT NULL,
  notes                TEXT,
  status_code          VARCHAR(32)  NOT NULL, -- order_items_status
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_oi_order (order_id),
  KEY ix_oi_menu_item (menu_item_id),
  CONSTRAINT fk_oi_order     FOREIGN KEY (order_id)    REFERENCES orders(order_id)       ON DELETE CASCADE,
  CONSTRAINT fk_oi_menu_item FOREIGN KEY (menu_item_id) REFERENCES menu_items(menu_item_id),
  CONSTRAINT fk_oi_status    FOREIGN KEY (status_code)  REFERENCES order_items_status(status_code)
) ENGINE=InnoDB;

-- Junction: which discounts were applied to which orders
CREATE TABLE order_discounts (
  order_id            BIGINT  NOT NULL,
  discount_id         BIGINT  NOT NULL,
  applied_value_minor INT     NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, discount_id),
  CONSTRAINT fk_order_discounts_order    FOREIGN KEY (order_id)   REFERENCES orders(order_id)     ON DELETE CASCADE,
  CONSTRAINT fk_order_discounts_discount FOREIGN KEY (discount_id) REFERENCES discounts(discount_id)
) ENGINE=InnoDB;

CREATE TABLE receipts (
  receipt_id      BIGINT       PRIMARY KEY AUTO_INCREMENT,
  order_id        BIGINT       NOT NULL UNIQUE,
  receipt_number  VARCHAR(64)  NOT NULL UNIQUE,
  printed_copies  JSON,
  content_json    JSON,
  printed_at      DATETIME(3),
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_receipts_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_methods (
  method_id    BIGINT       PRIMARY KEY AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL UNIQUE,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE payments (
  payment_id    BIGINT       PRIMARY KEY AUTO_INCREMENT,
  order_id      BIGINT       NOT NULL,
  amount_minor  INT          NOT NULL,
  method_id     BIGINT       NOT NULL,
  status_code   VARCHAR(32)  NOT NULL, -- payments_status
  ref_code      VARCHAR(100),
  paid_at       DATETIME(3),
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_payments_order (order_id),
  CONSTRAINT fk_payments_order  FOREIGN KEY (order_id)  REFERENCES orders(order_id)         ON DELETE CASCADE,
  CONSTRAINT fk_payments_method FOREIGN KEY (method_id) REFERENCES payment_methods(method_id),
  CONSTRAINT fk_payments_status FOREIGN KEY (status_code) REFERENCES payments_status(status_code)
) ENGINE=InnoDB;

CREATE TABLE refunds (
  refund_id     BIGINT       PRIMARY KEY AUTO_INCREMENT,
  order_id      BIGINT       NOT NULL,
  payment_id    BIGINT       NULL,
  amount_minor  INT          NOT NULL,
  reason_code   VARCHAR(32)  NOT NULL, -- refunds_reason
  approved_by   CHAR(9)      NULL,
  processed_by  CHAR(9)      NULL,
  refunded_at   DATETIME(3)  NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_refunds_payment (payment_id),
  CONSTRAINT fk_refunds_order     FOREIGN KEY (order_id)     REFERENCES orders(order_id)    ON DELETE CASCADE,
  CONSTRAINT fk_refunds_payment   FOREIGN KEY (payment_id)   REFERENCES payments(payment_id),
  CONSTRAINT fk_refunds_reason    FOREIGN KEY (reason_code)  REFERENCES refunds_reason(reason_code),
  CONSTRAINT fk_refunds_approved  FOREIGN KEY (approved_by)  REFERENCES employees(employee_id),
  CONSTRAINT fk_refunds_processed FOREIGN KEY (processed_by) REFERENCES employees(employee_id)
) ENGINE=InnoDB;

CREATE TABLE cash_drawer_transactions (
  txn_id        BIGINT       PRIMARY KEY AUTO_INCREMENT,
  shift_id      BIGINT       NOT NULL,
  order_id      BIGINT       NULL,
  payment_id    BIGINT       NULL,
  type_code     VARCHAR(32)  NOT NULL, -- cash_drawer_transactions_type
  amount_minor  INT          NOT NULL,
  reason        VARCHAR(255),
  employee_id   CHAR(9)      NOT NULL,
  occurred_at   DATETIME(3)  NOT NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cdt_shift (shift_id),
  KEY ix_cdt_order (order_id),
  KEY ix_cdt_payment (payment_id),
  CONSTRAINT fk_cdt_shift    FOREIGN KEY (shift_id)    REFERENCES shifts(shift_id)       ON DELETE CASCADE,
  CONSTRAINT fk_cdt_order    FOREIGN KEY (order_id)    REFERENCES orders(order_id),
  CONSTRAINT fk_cdt_payment  FOREIGN KEY (payment_id)  REFERENCES payments(payment_id),
  CONSTRAINT fk_cdt_type     FOREIGN KEY (type_code)   REFERENCES cash_drawer_transactions_type(type_code),
  CONSTRAINT fk_cdt_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB;

-- ===== Inventory =====
CREATE TABLE inventory_items (
  inventory_item_id BIGINT        PRIMARY KEY AUTO_INCREMENT,
  name              VARCHAR(200)  NOT NULL,
  sku               VARCHAR(100)  UNIQUE,
  uom               VARCHAR(32)   NOT NULL,   -- e.g., 'g','ml','pc'
  reorder_level     DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  is_active         TINYINT(1)    NOT NULL DEFAULT 1,
  cost_minor        INT           NOT NULL DEFAULT 0,
  created_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE menu_item_ingredients (
  menu_item_id       BIGINT        NOT NULL,
  inventory_item_id  BIGINT        NOT NULL,
  qty_per            DECIMAL(12,3) NOT NULL,
  uom                VARCHAR(32)   NOT NULL,
  PRIMARY KEY (menu_item_id, inventory_item_id),
  CONSTRAINT fk_mii_menu_item  FOREIGN KEY (menu_item_id)      REFERENCES menu_items(menu_item_id)        ON DELETE CASCADE,
  CONSTRAINT fk_mii_inv_item   FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(inventory_item_id)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  movement_id       BIGINT        PRIMARY KEY AUTO_INCREMENT,
  inventory_item_id BIGINT        NOT NULL,
  type_code         VARCHAR(32)   NOT NULL, -- inventory_movements_type
  qty_delta         DECIMAL(12,3) NOT NULL,
  reason            VARCHAR(255),
  ref_entity        VARCHAR(100), -- optional (e.g., 'order:12345')
  employee_id       CHAR(9)       NULL,
  moved_at          DATETIME(3)   NOT NULL,
  created_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_im_item (inventory_item_id),
  CONSTRAINT fk_im_item     FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(inventory_item_id),
  CONSTRAINT fk_im_type     FOREIGN KEY (type_code)         REFERENCES inventory_movements_type(type_code),
  CONSTRAINT fk_im_employee FOREIGN KEY (employee_id)       REFERENCES employees(employee_id)
) ENGINE=InnoDB;

CREATE TABLE inventory_levels (
  inventory_item_id BIGINT        PRIMARY KEY,
  on_hand           DECIMAL(14,3) NOT NULL DEFAULT 0.000,
  updated_at        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_inv_levels_item FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(inventory_item_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ===== System / Auth =====
CREATE TABLE settings (
  `key`    VARCHAR(100) PRIMARY KEY,
  `value`  TEXT
) ENGINE=InnoDB;

CREATE TABLE auth_sessions (
  session_id   CHAR(36)     PRIMARY KEY,
  employee_id  CHAR(9)      NOT NULL,
  channel      VARCHAR(32),
  ip_address   VARCHAR(64),
  user_agent   VARCHAR(255),
  expires_at   DATETIME(3)  NOT NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_auth_sessions_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_trail (
  audit_id     BIGINT       PRIMARY KEY AUTO_INCREMENT,
  occurred_at  DATETIME(3)  NOT NULL,
  employee_id  CHAR(9)      NULL,
  channel      VARCHAR(32),
  action       VARCHAR(64)  NOT NULL,
  entity_type  VARCHAR(64)  NOT NULL,
  entity_id    VARCHAR(64)  NOT NULL,
  summary      VARCHAR(255),
  before_data  JSON,
  after_data   JSON,
  CONSTRAINT fk_audit_employee FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS=1;