-- ACCOUNT INFORMATION
CREATE TABLE IF NOT EXISTS credential_types (
  type_code VARCHAR(32) PRIMARY KEY  -- 'employee_id','username','email'
) ENGINE=InnoDB;

INSERT IGNORE INTO credential_types (type_code)
VALUES ('employee_id'),('username'),('email');

-- Aliases (each togglable)
CREATE TABLE IF NOT EXISTS employee_credentials (
  cred_id      BIGINT       PRIMARY KEY AUTO_INCREMENT,
  employee_id  CHAR(9)      NOT NULL,
  type_code    VARCHAR(32)  NOT NULL,         -- FK -> credential_types
  value        VARCHAR(255) NOT NULL,         -- the login string
  is_enabled   TINYINT(1)   NOT NULL DEFAULT 1,
  is_verified  TINYINT(1)   NOT NULL DEFAULT 0,
  is_primary   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  CONSTRAINT fk_empcred_emp  FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
  CONSTRAINT fk_empcred_type FOREIGN KEY (type_code)   REFERENCES credential_types(type_code),

  UNIQUE KEY uq_empcred_global_alias (type_code, value),
  UNIQUE KEY uq_empcred_primary_per_type (employee_id, type_code, is_primary),

  KEY ix_empcred_lookup (type_code, value),
  KEY ix_empcred_emp (employee_id)
) ENGINE=InnoDB;















CREATE TABLE discounts (
  discount_id        BIGINT        PRIMARY KEY AUTO_INCREMENT,
  code               VARCHAR(64)   UNIQUE,
  name               VARCHAR(150)  NOT NULL,
  type_code          VARCHAR(32)   NOT NULL,  -- discounts_type
  value              DECIMAL(12,4) NOT NULL,  -- if 'percent', store e.g. 10.0 for 10%
  scope              VARCHAR(32)   NOT NULL,  -- free-form until you define a lookup (e.g., 'order','item')
  is_stackable       TINYINT(1)    NOT NULL DEFAULT 0,
  requires_approval  TINYINT(1)    NOT NULL DEFAULT 0,
  is_active          TINYINT(1)    NOT NULL DEFAULT 1,
  created_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_discounts_type FOREIGN KEY (type_code) REFERENCES discounts_type(type_code)
) ENGINE=InnoDB;


