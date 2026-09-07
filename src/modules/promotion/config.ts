import { ModuleConfig } from '@cool-midway/core';

export default () =>
  ({
    name: '推广大使模块',
    description: '推广归因、佣金结算、余额账本与提现审核',
    middlewares: [],
    globalMiddlewares: [],
    order: 0,
  } as ModuleConfig);
