ALTER TABLE `message_info`
  ADD COLUMN `payType` tinyint NULL COMMENT '支付来源 1套餐配额 2余额 3在线支付 4模拟支付' AFTER `feeAmount`;

ALTER TABLE `conversation_timeline`
  ADD COLUMN `smsCount` tinyint NULL COMMENT '计费条数' AFTER `feeAmount`,
  ADD COLUMN `payType` tinyint NULL COMMENT '支付来源 1套餐配额 2余额 3在线支付 4模拟支付' AFTER `smsCount`;
