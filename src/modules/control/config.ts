import { ModuleConfig } from '@cool-midway/core';

export default () =>
  ({
    name: '总控制台',
    description: '超管高权限操作、统计与审计',
    middlewares: [],
    globalMiddlewares: [],
    order: 0,
  } as ModuleConfig);
