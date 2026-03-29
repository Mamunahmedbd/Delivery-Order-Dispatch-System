import { Column, Entity, Index } from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { LogLevel } from '../../constants/log-level.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { LogDto } from './dtos/log.dto.ts';

@Entity({ name: 'logs' })
@Index('IDX_logs_context_action', ['context', 'action'])
@Index('IDX_logs_created_at', ['createdAt'])
@UseDto(LogDto)
export class LogEntity extends AbstractEntity<LogDto> {
  @Column({ type: 'enum', enum: LogLevel })
  level!: LogLevel;

  @Column({ type: 'varchar' })
  context!: string;

  @Column({ type: 'varchar' })
  action!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  orderId!: Uuid | null;

  @Column({ type: 'uuid', nullable: true })
  driverId!: Uuid | null;

  @Column({ type: 'uuid', nullable: true })
  userId!: Uuid | null;
}
