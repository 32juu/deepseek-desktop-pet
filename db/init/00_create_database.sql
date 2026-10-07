-- =============================================================
-- 建库与专用账号（初始化只需执行一次）
-- 用法：以管理员身份在项目根目录运行
--   mysql -u root -p < db/init/00_create_database.sql
-- =============================================================

-- 数据库：项目早期单用户本地运行，字符集固定 utf8mb4
CREATE DATABASE IF NOT EXISTS `pet_assistant`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- 应用专用账号：禁止用 root 跑应用
CREATE USER IF NOT EXISTS 'pet_app'@'localhost' IDENTIFIED BY 'CHANGE_ME_ON_FIRST_SETUP';

-- 只授予本库权限，不给全局权限（CLAUDE.md 第 20 节：最小权限）
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON `pet_assistant`.* TO 'pet_app'@'localhost';

FLUSH PRIVILEGES;

-- 校验
SELECT SCHEMA_NAME AS `database`, DEFAULT_CHARACTER_SET_NAME AS `charset`, DEFAULT_COLLATION_NAME AS `collation`
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'pet_assistant';

SELECT GRANTEE, PRIVILEGE_TYPE
FROM information_schema.USER_PRIVILEGES WHERE GRANTEE LIKE "'pet_app'%" LIMIT 1;

SHOW GRANTS FOR 'pet_app'@'localhost';
