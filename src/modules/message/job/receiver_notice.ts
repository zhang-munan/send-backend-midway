import { Job, IJob } from '@midwayjs/cron';
import { Inject } from '@midwayjs/core';
import { MessageReceiverNoticeService } from '../service/receiver_notice';

@Job({ cronTime: '*/10 * * * * *', start: true })
export class MessageReceiverNoticeJob implements IJob {
  @Inject()
  messageReceiverNoticeService: MessageReceiverNoticeService;

  async onTick() {
    await this.messageReceiverNoticeService.processPending();
  }
}
