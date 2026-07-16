import { CoolController, BaseController, CoolTag, TagTypes } from '@cool-midway/core';
import { Body, Get, Inject, Post, Query } from '@midwayjs/core';
import { MessageInfoEntity } from '../../entity/info';
import { MessageInfoService } from '../../service/info';

/**
 * 消息信息-APP端
 */
@CoolController({
  api: [],
  entity: MessageInfoEntity,
})
export class AppMessageInfoController extends BaseController {
  @Inject()
  ctx;

  @Inject()
  messageInfoService: MessageInfoService;

  /**
   * 发送消息
   */
  @Post('/send', { summary: '发送消息' })
  async send(@Body() body) {
    return this.ok(
      await this.messageInfoService.sendMessage(this.ctx.user.id, body)
    );
  }

  /**
   * 取消定时消息
   */
  @Post('/cancel/:id', { summary: '取消定时消息' })
  async cancel(@Query('id') id: number) {
    return this.ok(
      await this.messageInfoService.cancelMessage(this.ctx.user.id, id)
    );
  }

  /**
   * 重新发送
   */
  @Post('/resend/:id', { summary: '重新发送' })
  async resend(@Query('id') id: number) {
    return this.ok(
      await this.messageInfoService.resendMessage(this.ctx.user.id, id)
    );
  }

  /**
   * 发送记录列表
   */
  @Get('/recordList', { summary: '发送记录列表' })
  async recordList(
    @Query('page') page: number,
    @Query('size') size: number,
    @Query() query
  ) {
    return this.ok(
      await this.messageInfoService.recordList({
        page: page || 1,
        size: size || 10,
        userId: this.ctx.user.id,
        ...query,
      })
    );
  }

  /** 公开广场列表，无需登录 */
  @CoolTag(TagTypes.IGNORE_TOKEN)
  @Get('/publicList', { summary: '广场公开消息列表' })
  async publicList(
    @Query('page') page: number = 1,
    @Query('size') size: number = 10
  ) {
    return this.ok(await this.messageInfoService.publicList(page, size));
  }

  /** 首页最近动态（当前用户当日发送、收到回复与送达汇总） */
  @Get('/recentActivity', { summary: '首页最近动态' })
  async recentActivity() {
    return this.ok(
      await this.messageInfoService.recentActivity(this.ctx.user.id)
    );
  }

  /**
   * 消息详情
   */
  @Get('/messageDetail', { summary: '消息详情' })
  async messageDetail(@Query('id') id: number) {
    return this.ok(
      await this.messageInfoService.messageDetail(this.ctx.user.id, id)
    );
  }

  /**
   * 检查发送频率
   */
  @Get('/checkQuota', { summary: '检查发送频率' })
  async checkQuota(@Query('receiverPhone') receiverPhone: string) {
    return this.ok(
      await this.messageInfoService.checkQuota(this.ctx.user.id, receiverPhone)
    );
  }

  /**
   * 计算发送费用
   */
  @Post('/calculateFee', { summary: '计算发送费用' })
  async calculateFee(@Body('content') content: string) {
    return this.ok({
      feeAmount: this.messageInfoService.calculateFee(content),
    });
  }
}
