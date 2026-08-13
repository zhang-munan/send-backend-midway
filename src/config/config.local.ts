import { CoolConfig } from '@cool-midway/core';
import { MidwayConfig } from '@midwayjs/core';
import { TenantSubscriber } from '../modules/base/db/tenant';

/**
 * 本地开发 npm run dev 读取的配置文件
 */
export default {
  typeorm: {
    dataSource: {
      default: {
        type: 'mysql',
        host: '124.222.204.121',
        port: 3306,
        username: 'app_user',
        password: 'Secret@mysql8.0',
        database: 'db_bangni',
        // MySQL DATETIME 按业务时区解释，和 ADB worker 的 NOW() 保持一致。
        timezone: '+08:00',
        // 自动建表 注意：线上部署的时候不要使用，有可能导致数据丢失
        // 不允许自动修改已存在的表结构；金额迁移等变更必须通过 SQL 脚本执行。
        synchronize: false,
        // 打印日志
        logging: false,
        // 字符集
        charset: 'utf8mb4',
        // 是否开启缓存
        cache: true,
        // 实体路径
        entities: ['**/modules/*/entity'],
        // 订阅者
        subscribers: [TenantSubscriber],
        // 连接池配置：防止空闲连接被服务器/防火墙静默断开后复用导致 ETIMEDOUT
        extra: {
          // 连接池大小
          connectionLimit: 10,
          waitForConnections: true,
          // 连接超时（ms）
          connectTimeout: 20000,
          // 开启 TCP KeepAlive，让 OS 定期发探测包，及时发现并回收僵死连接
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        },
      },
    },
  },
  cool: {
    // 实体与路径，跟生成代码、前端请求、swagger文档相关 注意：线上不建议开启，以免暴露敏感信息
    eps: true,
    // 是否自动导入模块数据库
    initDB: true,
    // 判断是否初始化的方式
    initJudge: 'db',
    // 是否自动导入模块菜单
    initMenu: true,
  } as CoolConfig,
} as MidwayConfig;
