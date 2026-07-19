import * as path from 'path';
import * as os from 'os';
import * as md5 from 'md5';
import * as fs from 'fs';

/**
 * 获得配置文件中的 keys
 * @returns
 */
const getKeys = () => {
  if (process.env.APP_KEYS) {
    return process.env.APP_KEYS;
  }
  const configFile = path.join(__dirname, '../config/config.default.js');
  const configContent = fs.readFileSync(configFile, 'utf8');
  return (
    configContent.match(/keys: '([^']+)'/)?.[1] ||
    'local-development-only-change-me'
  );
};

/**
 * 项目数据目录
 * @returns
 */
export const pDataPath = () => {
  // 容器中设置 COOL_DATA_PATH 后，可把上传文件稳定挂载到宿主机目录。
  if (process.env.COOL_DATA_PATH) {
    if (!fs.existsSync(process.env.COOL_DATA_PATH)) {
      fs.mkdirSync(process.env.COOL_DATA_PATH, { recursive: true });
    }
    return process.env.COOL_DATA_PATH;
  }
  const dirPath = path.join(os.homedir(), '.cool-admin', md5(getKeys()));
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

/**
 * 上传目录
 * @returns
 */
export const pUploadPath = () => {
  const uploadPath = path.join(pDataPath(), 'upload');
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  return uploadPath;
};

/**
 * 插件目录
 * @returns
 */
export const pPluginPath = () => {
  const pluginPath = path.join(pDataPath(), 'plugin');
  if (!fs.existsSync(pluginPath)) {
    fs.mkdirSync(pluginPath, { recursive: true });
  }
  return pluginPath;
};

/**
 * sqlite 数据库文件
 */
export const pSqlitePath = () => {
  return path.join(pDataPath(), 'cool.sqlite');
};

/**
 * 缓存目录
 * @returns
 */
export const pCachePath = () => {
  return path.join(pDataPath(), 'cache');
};
