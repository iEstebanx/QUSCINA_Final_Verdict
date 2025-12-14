-- TOO RESET DATA OF THE TABLE
TRUNCATE TABLE (table name);

-- ============================================================
-- ============================================================
-- ============================================================
-- ============================================================
-- Create the database (use utf8mb4)
CREATE DATABASE IF NOT EXISTS quscina
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;   -- use utf8mb4_0900_ai_ci if MySQL 8.0 (MariaDB doesn't have 0900)

-- Create an application user (pick a strong password)
CREATE USER IF NOT EXISTS 'quscina_user'@'localhost' IDENTIFIED BY 'StrongPass!234';
CREATE USER IF NOT EXISTS 'quscina_user'@'127.0.0.1' IDENTIFIED BY 'StrongPass!234';

-- Grant privileges on the app DB
GRANT ALL PRIVILEGES ON quscina.* TO 'quscina_user'@'localhost';
GRANT ALL PRIVILEGES ON quscina.* TO 'quscina_user'@'127.0.0.1';

FLUSH PRIVILEGES;

USE quscina;
-- ============================================================
SET time_zone = '+08:00';
SELECT @@global.time_zone, @@time_zone;

-- ============================================================
-- Employees
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  employee_id           CHAR(9)      NOT NULL,                         -- 9-digit app-generated ID
  first_name            VARCHAR(60)  NOT NULL,
  last_name             VARCHAR(60)  NOT NULL,
  phone                 VARCHAR(11)  NOT NULL,                         -- app validates 10–11 digits
  role                  ENUM('Admin','Manager','Chef','Cashier') NOT NULL,
  status                ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',

  username              VARCHAR(60)  DEFAULT NULL,
  email                 VARCHAR(191) DEFAULT NULL,

  login_employee_id     TINYINT      NOT NULL DEFAULT 1,
  login_username        TINYINT      NOT NULL DEFAULT 1,
  login_email           TINYINT      NOT NULL DEFAULT 1,

  password_hash         VARCHAR(100) NULL DEFAULT NULL                         -- bcrypt (~60 chars)
  pin_hash              VARCHAR(100) NULL DEFAULT NULL,

  password_last_changed DATETIME     DEFAULT NULL,
  photo_url             TEXT         DEFAULT NULL,

  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- 🔐 Security & lock tracking
  failed_login_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  lock_until            DATETIME DEFAULT NULL,                         -- UTC; null = not locked
  permanent_lock        TINYINT NOT NULL DEFAULT 0,                    -- permanent lock flag
  last_failed_login     DATETIME DEFAULT NULL,
  last_login_at         DATETIME DEFAULT NULL,
  last_login_ip         VARCHAR(45) DEFAULT NULL,

  PRIMARY KEY (employee_id),
  UNIQUE KEY uq_username (username),
  UNIQUE KEY uq_email (email),
  KEY ix_role (role),
  KEY ix_status (status),
  KEY ix_emp_lock (permanent_lock, lock_until)
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE= utf8mb4_0900_ai_ci 

-- ------------------------------------------------------------
-- ALIASES  (lookup table for login identifiers)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aliases (
  alias_key    VARCHAR(256) NOT NULL,   -- e.g. "username:admin"
  type         ENUM('employee_id','username','email') NOT NULL,
  value_lower  VARCHAR(191) NOT NULL,
  employee_id  CHAR(9) NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (alias_key),
  UNIQUE KEY uq_type_value (type, value_lower),
  KEY ix_alias_emp (employee_id),
  CONSTRAINT fk_alias_emp
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- login_attempts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id  CHAR(9) NULL,  -- NULL when identifier didn’t resolve to an account
  app ENUM('backoffice','pos') NOT NULL DEFAULT 'backoffice',
  identifier   VARCHAR(191) NOT NULL, -- the lowercased identifier the user typed
  success      TINYINT(1) NOT NULL,   -- 1=ok, 0=fail
  reason       ENUM('ok','bad_password','no_account','not_active','locked','perm_locked','method_disabled')
               NOT NULL,
  ip           VARCHAR(45) DEFAULT NULL,
  user_agent   VARCHAR(255) DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_emp_created (employee_id, created_at),
  KEY ix_created (created_at),
  KEY ix_identifier (identifier),
  KEY ix_app_created (app, created_at),
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- employee_lock_state
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_lock_state (
  employee_id  CHAR(9) NOT NULL,
  app          ENUM('backoffice','pos', 'backoffice_sq', 'pos_sq') NOT NULL,
  failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  lock_until   DATETIME DEFAULT NULL,   -- UTC
  permanent_lock TINYINT NOT NULL DEFAULT 0,
  last_failed_login DATETIME DEFAULT NULL,
  PRIMARY KEY (employee_id, app),
  CONSTRAINT fk_lock_emp
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE= utf8mb4_0900_ai_ci

-- ------------------------------------------------------------
-- SECURITY QUESTIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_security_questions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id  CHAR(9) NOT NULL,
  question_id  ENUM('pet','school','city','mother_maiden','nickname') NOT NULL,
  answer_hash  VARCHAR(100) NOT NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_sq_emp (employee_id),
  UNIQUE KEY uq_emp_question (employee_id, question_id),
  CONSTRAINT fk_sq_emp
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- OTP store for forgot password via email
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id      CHAR(9) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,  -- must match employees table
  email_lower      VARCHAR(191) NOT NULL,                                           -- store lowercase email
  purpose          ENUM('reset','login','verify_email') NOT NULL DEFAULT 'reset',
  channel          ENUM('email','sms') NOT NULL DEFAULT 'email',
  code_hash        VARCHAR(100) NOT NULL,
  status           ENUM('pending','used','expired','blocked') NOT NULL DEFAULT 'pending',
  attempts         INT NOT NULL DEFAULT 0,

  -- UTC timestamps: always stored in coordinated universal time (UTC)
  created_at       DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  expires_at       DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
  used_at          DATETIME NULL,
  expired_at       DATETIME NULL,
  blocked_at       DATETIME NULL,
  last_attempt_at  DATETIME NULL,

  /* Enforce: at most ONE pending row per (email_lower, purpose)
     NULLs don't participate in UNIQUE, so only 'pending' rows collide. */
  pending_enforcer TINYINT(1)
    AS (CASE WHEN status = 'pending' THEN 1 ELSE NULL END) STORED,

  PRIMARY KEY (id),

  -- Lookups
  KEY ix_otp_lookup (email_lower, purpose, status, expires_at),
  KEY ix_otp_created (created_at),
  KEY ix_otp_emp (employee_id),
  KEY ix_otp_expires (expires_at),

  -- One active 'pending' per email+purpose
  UNIQUE KEY ux_otp_one_pending (email_lower, purpose, pending_enforcer),

  CONSTRAINT fk_otp_emp
    FOREIGN KEY (employee_id)
    REFERENCES employees(employee_id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
SET GLOBAL event_scheduler = ON;

CREATE EVENT IF NOT EXISTS otp_expire_minutely
ON SCHEDULE EVERY 1 MINUTE
DO
  UPDATE otp
     SET status='expired', expired_at=UTC_TIMESTAMP()
   WHERE status='pending' AND expires_at <= UTC_TIMESTAMP();

-- ------------------------------------------------------------
-- SEED ADMIN (edit the hashes before running)
-- ------------------------------------------------------------

-- 1) Generate hashes in a terminal:
-- Password: Admin@1234
--    node -e "const b=require('bcryptjs');b.hash('Admin@1234',12).then(h=>console.log(h))"
-- PIN: 123456
--    node -e "const b=require('bcryptjs');b.hash('123456',12).then(h=>console.log(h))"
-- Optional SQ answer ('fluffy'):
--    node -e "const b=require('bcryptjs');b.hash('fluffy',12).then(h=>console.log(h))"

-- 2) Insert employee
INSERT INTO employees (
  employee_id, first_name, last_name, phone, role, status,
  username, email,
  login_employee_id, login_username, login_email,
  password_hash, pin_hash, password_last_changed
) VALUES (
  '202500001', 'System', 'Admin', '09559391324', 'Admin', 'Active',
  'admin', 'admin@quscina.local',
  1, 1, 1,
  '<PASTE_PASSWORD_HASH>', '<PASTE_PIN_HASH>', NOW()
)
ON DUPLICATE KEY UPDATE
  first_name=VALUES(first_name),
  last_name=VALUES(last_name),
  phone=VALUES(phone),
  role=VALUES(role),
  status=VALUES(status),
  username=VALUES(username),
  email=VALUES(email),
  login_employee_id=VALUES(login_employee_id),
  login_username=VALUES(login_username),
  login_email=VALUES(login_email),
  password_hash=VALUES(password_hash),
  pin_hash=VALUES(pin_hash),
  password_last_changed=VALUES(password_last_changed);

-- 3) Insert aliases (enables all 3 login identifiers)
INSERT INTO aliases (alias_key, type, value_lower, employee_id) VALUES
  ('employee_id:202500001', 'employee_id', '202500001', '202500001'),
  ('username:admin',        'username',    'admin',      '202500001'),
  ('email:admin@quscina.local','email',    'admin@quscina.local', '202500001')
ON DUPLICATE KEY UPDATE employee_id=VALUES(employee_id);

-- 4) Optional: one security question (answer "fluffy")
INSERT INTO employee_security_questions (employee_id, question_id, answer_hash)
VALUES ('202500001','pet','<PASTE_FLUFFY_HASH>')
ON DUPLICATE KEY UPDATE answer_hash=VALUES(answer_hash);

-- ============================================================
-- Menu (Items referencing categories)
-- ============================================================
CREATE TABLE IF NOT EXISTS `items` (
  `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`              VARCHAR(60)  NOT NULL,
  `nameLower`         VARCHAR(60)  AS (LOWER(`name`)) STORED,

  `description`       VARCHAR(300) NULL,

  `categoryId`        INT UNSIGNED NULL,                      -- FK → categories.id
  `categoryName`      VARCHAR(60)  NULL,                      -- denormalized for caching
  `categoryNameLower` VARCHAR(60)  NULL,
  `categoryKey`       VARCHAR(60)  NULL,

  `imageDataUrl`      LONGTEXT     NULL,                      -- base64 image
  `price`             DECIMAL(12,2) NOT NULL DEFAULT 0.00,    -- selling price

  `ingredients`       JSON         NULL,                      -- [{ingredientId,name,qty,price,...}]
  `costOverall`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,    -- total ingredient cost
  `profit`            DECIMAL(12,2) NOT NULL DEFAULT 0.00,    -- price - costOverall

  `active`            TINYINT(1)   NOT NULL DEFAULT 1,
  'manualAvailable'   TINYINT(1) NOT NULL DEFAULT 1,

  `createdAt`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  KEY `idx_items_categoryId`   (`categoryId`),
  KEY `idx_items_categoryKey`  (`categoryKey`),
  KEY `idx_items_updatedAt`    (`updatedAt`),

  -- 🔒 Enforce case-insensitive unique item names
  UNIQUE KEY `uq_items_name_lower` (`nameLower`),

  CONSTRAINT `fk_items_category_opt`
    FOREIGN KEY (`categoryId`)
    REFERENCES `categories`(`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Categories (for Menu / Items)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`            VARCHAR(60)  NOT NULL,
  `name_lower`      VARCHAR(60)  AS (LOWER(`name`)) STORED,  -- generated lower name
  `image_data_url`  LONGTEXT     NULL,                        -- base64 data:<mime>;base64,...
  `active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name_lower` (`name_lower`),
  KEY `idx_categories_active` (`active`),
  KEY `idx_categories_updated_at` (`updated_at`)
)
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Trigger: Auto-update item category fields after category rename
-- ------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_categories_after_update
AFTER UPDATE ON categories
FOR EACH ROW
BEGIN
  IF (NEW.name <> OLD.name OR NEW.name_lower <> OLD.name_lower) THEN
    UPDATE items
       SET categoryName      = NEW.name,
           categoryNameLower = NEW.name_lower,
           categoryKey       = NEW.name_lower
     WHERE categoryId = NEW.id;
  END IF;
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- Discounts (Menu)
-- ------------------------------------------------------------

-- Discounts table (matches your backend fields)
CREATE TABLE IF NOT EXISTS `discounts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NULL,           -- e.g. DISC-000001 (unique, human-friendly)
  `name` VARCHAR(120) NOT NULL,
  `type` ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  `value` DECIMAL(7,3) NOT NULL,         -- supports 0..100 (or a fixed amount)
  `scope` ENUM('order','item') NOT NULL DEFAULT 'order',
  `isStackable` TINYINT(1) NOT NULL DEFAULT 0,
  `requiresApproval` TINYINT(1) NOT NULL DEFAULT 0,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_discounts_code` (`code`),
  KEY `idx_discounts_active_created` (`isActive`, `createdAt`),

  -- Optional: prevent >100% if using percent
  CONSTRAINT `ck_discounts_percent_range`
    CHECK (
      (type <> 'percent') OR (value >= 0 AND value <= 100)
    )
) ENGINE=InnoDB;

-- ============================================================
-- INVENTORY CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS `inventory_categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `name_lower` VARCHAR(60)
    GENERATED ALWAYS AS (LOWER(`name`)) STORED,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_categories_name_lower` (`name_lower`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- INVENTORY INGREDIENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_ingredients` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `name_lower` VARCHAR(60)
    GENERATED ALWAYS AS (LOWER(`name`)) STORED,
  `category` VARCHAR(60) NOT NULL,
  `category_lower` VARCHAR(60)
    GENERATED ALWAYS AS (LOWER(`category`)) STORED,
  `type` VARCHAR(30) NOT NULL DEFAULT 'pack',
  `currentStock` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `lowStock` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_ingredients_name_lower` (`name_lower`),
  KEY `idx_inventory_ingredients_category` (`category`),
  KEY `idx_inventory_ingredients_category_lower` (`category_lower`),
  KEY `idx_inventory_ingredients_updatedAt` (`updatedAt`),

  CONSTRAINT `chk_category_nonempty`
    CHECK (CHAR_LENGTH(TRIM(`category`)) > 0),

  CONSTRAINT `chk_type_pack_or_pcs`
    CHECK (`type` IN ('pack', 'pcs'))
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- INVENTORY ACTIVITY LOG
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ts` DATETIME NULL,
  `employee` VARCHAR(60) NULL,
  `reason` VARCHAR(255) NULL,
  `io` ENUM('In','Out') NOT NULL DEFAULT 'In',
  `qty` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `ingredientId` INT UNSIGNED NULL,
  `ingredientName` VARCHAR(60) NULL,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_activity_ts` (`ts`),
  KEY `idx_inventory_activity_ingredientId` (`ingredientId`),
  KEY `idx_inventory_activity_io` (`io`),
  CONSTRAINT `fk_activity_ingredient`
    FOREIGN KEY (`ingredientId`)
    REFERENCES `inventory_ingredients`(`id`)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- POS SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_shifts (
  shift_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  terminal_id         VARCHAR(60) NOT NULL,
  employee_id         CHAR(9) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  status              ENUM('Open','Remitted','Voided') NOT NULL DEFAULT 'Open',

  opened_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at           DATETIME NULL,

  opening_float       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  opening_note        VARCHAR(255) NULL,

  total_gross_sales   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_refunds       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_discounts     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_tax           DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  total_cash_payments   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_card_payments   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_online_payments DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  total_cash_in       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_cash_out      DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  expected_cash       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  declared_cash       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  variance_cash       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  closing_note        VARCHAR(255) NULL,

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  next_order_no INT NOT NULL DEFAULT 1,

  shift_code      VARCHAR(20) NULL AFTER opening_note,
  shift_name      VARCHAR(60) NULL AFTER shift_code,
  scheduled_start TIME NULL AFTER shift_name,
  scheduled_end   TIME NULL AFTER scheduled_start,
  opened_early    TINYINT(1) NOT NULL DEFAULT 0 AFTER scheduled_end,
  early_minutes   INT NOT NULL DEFAULT 0 AFTER opened_early,
  early_reason    VARCHAR(255) NULL AFTER early_minutes,
  early_note      VARCHAR(255) NULL AFTER early_reason,

  PRIMARY KEY (shift_id),
  KEY ix_shift_employee (employee_id, status),
  KEY ix_shift_terminal (terminal_id, status),
  CONSTRAINT fk_shift_employee
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_shift_terminal_status_opened
  ON pos_shifts (terminal_id, status, opened_at);

-- ------------------------------------------------------------
-- POS SHIFT DENOMINATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_shift_denoms (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shift_id     BIGINT UNSIGNED NOT NULL,
  denom_value  DECIMAL(10,2) NOT NULL,
  qty          INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_denoms_shift (shift_id),
  CONSTRAINT fk_denoms_shift
    FOREIGN KEY (shift_id) REFERENCES pos_shifts(shift_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- POS CASH DRAWER MOVEMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_cash_moves (
  move_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shift_id     BIGINT UNSIGNED NOT NULL,
  type         ENUM('cash_in','cash_out','safe_drop','payout','refund_cash') NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  reason       VARCHAR(255) NULL,
  created_by   CHAR(9) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (move_id),
  KEY ix_moves_shift (shift_id, type),
  CONSTRAINT fk_moves_shift
    FOREIGN KEY (shift_id) REFERENCES pos_shifts(shift_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_moves_user
    FOREIGN KEY (created_by) REFERENCES employees(employee_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- POS CASH DRAWER MOVEMENTS DENOMINATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_cash_move_denoms (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  move_id       BIGINT UNSIGNED NOT NULL,
  denom_value   DECIMAL(10,2) NOT NULL,
  qty           INT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_move_denoms (move_id),
  CONSTRAINT fk_move_denoms_move
    FOREIGN KEY (move_id) REFERENCES pos_cash_moves(move_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- POS ORDERS (header)
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_orders (
  order_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  shift_id          BIGINT UNSIGNED NOT NULL,
  terminal_id       VARCHAR(60) NOT NULL,

  status            ENUM('pending','open','paid','voided','refunded')
                    NOT NULL DEFAULT 'pending',

  order_type        ENUM('Dine-in','Take-out')
                    NOT NULL DEFAULT 'Dine-in',

  source            VARCHAR(60) NOT NULL DEFAULT 'Cashier POS',

  customer_name     VARCHAR(80) NOT NULL DEFAULT 'Walk-in',
  table_no          VARCHAR(10) NULL,

  gross_amount      DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- sum of line totals
  discount_amount   DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- total discount
  net_amount        DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- gross - discount
  tax_amount        DECIMAL(12,2) NOT NULL DEFAULT 0.00,  -- 0 for now

  opened_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         DATETIME NULL,

  created_by CHAR(9) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  voided_by  CHAR(9) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL,
  voided_at         DATETIME NULL,
  void_reason       VARCHAR(255) NULL,

  notes             VARCHAR(255) NULL,

  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                    ON UPDATE CURRENT_TIMESTAMP,
  order_no INT NULL,

  PRIMARY KEY (order_id),

  KEY ix_orders_shift_status (shift_id, status),
  KEY ix_orders_table_status (table_no, status),
  KEY ix_orders_shift_order_no (shift_id, order_no),

  UNIQUE KEY ux_orders_shift_order_no (shift_id, order_no),

  CONSTRAINT fk_orders_shift
    FOREIGN KEY (shift_id) REFERENCES pos_shifts(shift_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_orders_created_by
    FOREIGN KEY (created_by) REFERENCES employees(employee_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT fk_orders_voided_by
    FOREIGN KEY (voided_by) REFERENCES employees(employee_id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- POS ORDER ITEMS (lines)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_order_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id     BIGINT UNSIGNED NOT NULL,

  item_id      INT UNSIGNED NULL,                -- FK → items.id (nullable for deleted menu items)
  item_name    VARCHAR(60) NOT NULL,             -- snapshot
  item_price   DECIMAL(12,2) NOT NULL DEFAULT 0, -- per unit
  qty          DECIMAL(12,3) NOT NULL DEFAULT 1, -- allow fractional if ever needed
  voided_qty DECIMAL(12,3) NOT NULL DEFAULT 0;
  refunded_qty DECIMAL(12,3) NOT NULL DEFAULT 0,
  line_total   DECIMAL(12,2) NOT NULL DEFAULT 0, -- item_price * qty

  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_order_items_order (order_id),

  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES pos_orders(order_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_order_items_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- POS ORDER DISCOUNTS (header-level)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_order_discounts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id     BIGINT UNSIGNED NOT NULL,

  name         VARCHAR(80) NOT NULL,        -- e.g. "PWD", "Senior", etc.
  percent      DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY ix_order_discounts_order (order_id),

  CONSTRAINT fk_order_discounts_order
    FOREIGN KEY (order_id) REFERENCES pos_orders(order_id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- POS ORDER PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_order_payments (
  payment_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id     BIGINT UNSIGNED NOT NULL,
  shift_id     BIGINT UNSIGNED NOT NULL,

  slot_no      TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- 1 or 2 for split
  method_name  VARCHAR(60) NOT NULL,                 -- "Cash", "GCash", etc.
  amount       DECIMAL(12,2) NOT NULL,               -- positive = sale, negative = refund (if you want)
  is_refund    TINYINT(1) NOT NULL DEFAULT 0,

  gcash_last4  CHAR(4) NULL,                         -- for your GCash flow

  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (payment_id),
  KEY ix_order_payments_order (order_id),
  KEY ix_order_payments_shift (shift_id),

  CONSTRAINT fk_order_payments_order
    FOREIGN KEY (order_id) REFERENCES pos_orders(order_id)
    ON DELETE CASCADE,

  CONSTRAINT fk_order_payments_shift
    FOREIGN KEY (shift_id) REFERENCES pos_shifts(shift_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;


-- ============================================================
-- Settings (Payment Types)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_types (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(60)     NOT NULL,
  name_lower   VARCHAR(60)     NOT NULL,
  active       TINYINT(1)      NOT NULL DEFAULT 1,
  sort_order   INT             NOT NULL DEFAULT 0,

  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_types_name_lower (name_lower),
  KEY ix_active (active),
  KEY ix_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payment_types (name, name_lower, active, sort_order)
SELECT s.n, s.nl, s.act, s.so
FROM (
  SELECT 'Cash' AS n, 'cash' AS nl, 1 AS act, 10 AS so
  UNION ALL
  SELECT 'Card' AS n, 'card' AS nl, 1 AS act, 20 AS so
) AS s
LEFT JOIN payment_types p
  ON p.name_lower = s.nl
WHERE p.id IS NULL;


-- ------------------------------------------------------------
-- Authorization Pins
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authorization_pins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  app ENUM('backoffice','pos') NOT NULL DEFAULT 'backoffice',
  pin_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_changed_by CHAR(9) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_app_active (app, is_active),
  KEY idx_last_changed_by (last_changed_by),

  CONSTRAINT fk_authorization_pins_last_changed_by
    FOREIGN KEY (last_changed_by)
    REFERENCES employees(employee_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- BACKUP JOBS (logs for both backup & restore actions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_jobs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  action                ENUM('backup','restore', 'schedule-update') NOT NULL,
  trigger_source        ENUM('manual','schedule','test-run') NOT NULL DEFAULT 'manual',
  backup_type           ENUM('full','schema') NOT NULL DEFAULT 'full',

  filename              VARCHAR(255) NOT NULL,               -- e.g. backup-full_2025-03-16_2330.sql
  size_bytes            BIGINT UNSIGNED DEFAULT NULL,        -- filled in after success
  status                ENUM('pending','running','success','failed')
                        NOT NULL DEFAULT 'pending',
  message               TEXT DEFAULT NULL,                   -- error or notes
  notes                 VARCHAR(255) DEFAULT NULL,           -- from UI "why are you running this backup?"
  started_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at           DATETIME DEFAULT NULL,
  created_by_employee_id CHAR(9) DEFAULT NULL,               -- FK to employees.employee_id

  PRIMARY KEY (id),
  KEY ix_action_started (action, started_at),
  KEY ix_status (status),
  CONSTRAINT fk_backup_jobs_employee
    FOREIGN KEY (created_by_employee_id)
    REFERENCES employees(employee_id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------
-- BACKUP SCHEDULE (single-row config for the shop)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_schedule (
  id                    TINYINT NOT NULL DEFAULT 1,
  frequency             ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'daily',
  time_of_day           CHAR(5) NOT NULL DEFAULT '22:00',  -- 24h HH:MM (e.g. '22:00' = 10pm)

  day_of_week           TINYINT DEFAULT NULL,               -- 0=Sunday..6=Saturday (for weekly)
  day_of_month          TINYINT DEFAULT NULL,               -- 1..31 (for monthly)

  retention_days        INT NOT NULL DEFAULT 14,
  next_run_at           DATETIME DEFAULT NULL,

  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
  updated_by_employee_id CHAR(9) DEFAULT NULL,

  PRIMARY KEY (id),
  CONSTRAINT fk_backup_schedule_employee
    FOREIGN KEY (updated_by_employee_id)
    REFERENCES employees(employee_id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- seed one row
INSERT INTO backup_schedule (id)
VALUES (1)
ON DUPLICATE KEY UPDATE id = id;

-- ============================================================
-- AUDIT TRAIL (Every Actions)
-- ============================================================
CREATE TABLE audit_trail (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL,
  action VARCHAR(150) NOT NULL,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detail JSON NOT NULL
);backup_jobs


-- ============================================================
-- Detected Printers (Settings Cashier-POS)
-- ============================================================
CREATE TABLE detected_printers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  printerId VARCHAR(255),
  name VARCHAR(255),
  type VARCHAR(255),
  source VARCHAR(50),
  deviceId VARCHAR(255),
  lastSeen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);