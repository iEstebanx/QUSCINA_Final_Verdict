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

-- ------------------------------------------------------------
-- EMPLOYEES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  employee_id            CHAR(9)      NOT NULL,                  -- 9-digit app-generated id
  first_name             VARCHAR(60)  NOT NULL,
  last_name              VARCHAR(60)  NOT NULL,
  phone                  VARCHAR(11)  NOT NULL,                  -- app validates 10–11 digits
  role                   ENUM('Admin','Manager','Chef','Cashier') NOT NULL,
  status                 ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',

  username               VARCHAR(60)  NULL,                      -- lowercased in app
  email                  VARCHAR(191) NULL,

  login_employee_id      TINYINT(1)   NOT NULL DEFAULT 1,
  login_username         TINYINT(1)   NOT NULL DEFAULT 1,
  login_email            TINYINT(1)   NOT NULL DEFAULT 1,

  password_hash          VARCHAR(100) NOT NULL,                  -- bcrypt (~60 chars)
  pin_hash               VARCHAR(100) NOT NULL,

  password_last_changed  DATETIME NULL,
  photo_url              TEXT NULL,

  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (employee_id),
  UNIQUE KEY uq_username (username),
  UNIQUE KEY uq_email    (email),
  KEY ix_role (role),
  KEY ix_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id     CHAR(9) NULL,                         -- may be null if email not linked yet
  email_lower     VARCHAR(191) NOT NULL,
  code_hash       VARCHAR(100) NOT NULL,
  status          ENUM('pending','used','expired','blocked') NOT NULL DEFAULT 'pending',
  attempts        INT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME NOT NULL,
  used_at         DATETIME NULL,
  expired_at      DATETIME NULL,
  blocked_at      DATETIME NULL,
  last_attempt_at DATETIME NULL,

  PRIMARY KEY (id),
  KEY ix_otp_email_status (email_lower, status),
  KEY ix_otp_created (created_at),
  KEY ix_otp_emp (employee_id),
  CONSTRAINT fk_otp_emp
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- ------------------------------------------------------------
-- Items (Menu Items referencing categories)
-- ------------------------------------------------------------
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

  `createdAt`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),

  KEY `idx_items_categoryId`   (`categoryId`),
  KEY `idx_items_categoryKey`  (`categoryKey`),
  KEY `idx_items_updatedAt`    (`updatedAt`),
  KEY `idx_items_nameLower`    (`nameLower`),

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

-- ============================================================
-- INVENTORY INGREDIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS `inventory_ingredients` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `name_lower` VARCHAR(60)
    GENERATED ALWAYS AS (LOWER(`name`)) STORED,
  `category` VARCHAR(60) NOT NULL,
  `category_lower` VARCHAR(60)
    GENERATED ALWAYS AS (LOWER(`category`)) STORED,
  `type` VARCHAR(30) NULL,
  `currentStock` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `lowStock` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME NOT NULL,
  `updatedAt` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_ingredients_name_lower` (`name_lower`),
  KEY `idx_inventory_ingredients_category` (`category`),
  KEY `idx_inventory_ingredients_category_lower` (`category_lower`),
  KEY `idx_inventory_ingredients_updatedAt` (`updatedAt`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INVENTORY ACTIVITY LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS `inventory_activity` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ts` DATETIME NULL,
  `employee` VARCHAR(60) NULL,
  `remarks` VARCHAR(255) NULL,
  `io` ENUM('In','Out') NOT NULL DEFAULT 'In',
  `qty` DECIMAL(12,3) NOT NULL DEFAULT 0,
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0,
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

-- ------------------------------------------------------------
-- 
-- ------------------------------------------------------------


-- POS SHIFTS
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

  PRIMARY KEY (shift_id),
  KEY ix_shift_employee (employee_id, status),
  KEY ix_shift_terminal (terminal_id, status),
  CONSTRAINT fk_shift_employee
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SHIFT DENOMINATIONS
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

-- CASH DRAWER MOVEMENTS
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