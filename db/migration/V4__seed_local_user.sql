-- =============================================================
-- Description: 本地单用户种子数据（MVP）
-- Doc        : docs/architecture.md（单用户本地优先）、docs/product.md
-- 说明       : 无用户系统，固定一条本地用户记录。所有业务表用 user_id 关联它。
-- 幂等       : 全部使用 INSERT ... ON DUPLICATE KEY UPDATE / IGNORE，可重复执行
-- =============================================================

-- 本地默认用户（id 固定为 1；Java 侧对应常量见 docs/database.md 1.8 与 docs/dev-log.md D8）
--
-- 写法说明：不使用 `VALUES(col)`（MySQL 8.0.20 起已弃用，会告警 1287），
--   改用行别名 ROW 后引用别名列。注：本文件在别名写法之前已执行过，
--   按 Flyway 校验和不可变性此处保留修改后的写法，历史库不会重跑本文件。
INSERT INTO `users` (`id`, `username`, `display_name`, `status`)
VALUES (1, 'local', '学习者', 'ACTIVE') AS new_row
ON DUPLICATE KEY UPDATE `username` = new_row.`username`;

-- 桌宠偏好：主动提醒默认关闭（CLAUDE.md 少打扰原则，见 docs/dev-log.md D4）
INSERT INTO `pet_settings` (`user_id`, `proactive_enabled`, `always_on_top`, `sound_enabled`)
VALUES (1, 0, 1, 1) AS new_row
ON DUPLICATE KEY UPDATE `user_id` = new_row.`user_id`;
