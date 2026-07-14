-- 测试环境：清空业务数据，保留套餐、系统账号、角色、菜单、字典及全局配置。
-- 目标数据库：db_bangni（执行前请确认当前连接的库）。
-- 注意：此脚本不可恢复；请勿在生产环境执行。

SET FOREIGN_KEY_CHECKS = 0;

-- 会话与消息
TRUNCATE TABLE `conversation_timeline`;
TRUNCATE TABLE `conversation_info`;
TRUNCATE TABLE `message_reply`;
TRUNCATE TABLE `message_info`;

-- 订单与余额
TRUNCATE TABLE `order_info`;
TRUNCATE TABLE `user_balance`;
-- `product_info` 为套餐管理表，保留其数据。

-- 用户业务资料
TRUNCATE TABLE `user_address`;
TRUNCATE TABLE `user_wx`;
TRUNCATE TABLE `user_info`;
TRUNCATE TABLE `setting_user`;

-- 模板与空间
TRUNCATE TABLE `template_collect`;
TRUNCATE TABLE `template_info`;
TRUNCATE TABLE `template_category`;
TRUNCATE TABLE `space_info`;
TRUNCATE TABLE `space_type`;

-- 任务、反馈及回收站
TRUNCATE TABLE `task_log`;
TRUNCATE TABLE `task_info`;
TRUNCATE TABLE `feedback_info`;
TRUNCATE TABLE `recycle_data`;

SET FOREIGN_KEY_CHECKS = 1;
