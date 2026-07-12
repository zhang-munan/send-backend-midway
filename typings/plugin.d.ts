import * as upload_oss from './upload-oss';
import * as sms_tx from './sms-tx';
import * as pay_wx from './pay-wx';
import * as wx from './wx';
import { BaseUpload, MODETYPE } from './upload';
type AnyString = string & {};
/**
 * 插件类型声明
 */
interface PluginMap {
  upload: BaseUpload;
  wx: wx.CoolPlugin;
  'pay-wx': pay_wx.CoolPlugin;
  'sms-tx': sms_tx.CoolPlugin;
  'upload-oss': upload_oss.CoolPlugin;
}
