SET @schema_name = DATABASE();

SET @active_token_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'active_token'
);
SET @sql = IF(
  @active_token_exists = 0,
  'ALTER TABLE users ADD COLUMN active_token VARCHAR(500) DEFAULT NULL',
  'SELECT ''active_token already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @active_device_id_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'active_device_id'
);
SET @sql = IF(
  @active_device_id_exists = 0,
  'ALTER TABLE users ADD COLUMN active_device_id VARCHAR(255) DEFAULT NULL',
  'SELECT ''active_device_id already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
