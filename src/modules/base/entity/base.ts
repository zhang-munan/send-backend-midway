import { Index, PrimaryGeneratedColumn, Column } from 'typeorm';
import * as moment from 'moment';
import { CoolBaseEntity } from '@cool-midway/core';

/**
 * 时间转换器
 */
export const transformerTime = {
  to(value) {
    return value
      ? moment(value).format('YYYY-MM-DD HH:mm:ss')
      : moment().format('YYYY-MM-DD HH:mm:ss');
  },
  from(value) {
    return value;
  },
};

/**
 * Json转换器
 */
export const transformerJson = {
  to: value => value,
  from: value => {
    // 确保从数据库返回的是对象
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    }
    return value;
  },
};

/**
 * Text JSON转换器
 * text/varchar 字段不会像 json 字段一样自动序列化对象，写入前需要显式 stringify。
 */
export const transformerTextJson = {
  to: value => {
    if (value === null || value === undefined || typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  },
  from: transformerJson.from,
};
/**
 * 实体基类
 */
export abstract class BaseEntity extends CoolBaseEntity {
  // 默认自增
  @PrimaryGeneratedColumn('increment', {
    comment: 'ID',
  })
  id: number;

  @Index()
  @Column({
    comment: '创建时间',
    type: 'varchar',
    transformer: transformerTime,
  })
  createTime: Date;

  @Index()
  @Column({
    comment: '更新时间',
    type: 'varchar',
    transformer: transformerTime,
  })
  updateTime: Date;

  @Index()
  @Column({ comment: '租户ID', nullable: true })
  tenantId: number;
}
