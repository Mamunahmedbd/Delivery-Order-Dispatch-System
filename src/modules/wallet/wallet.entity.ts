import type { Relation } from 'typeorm';
import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  VersionColumn,
} from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { UserEntity } from '../user/user.entity.ts';
import { WalletDto } from './dtos/wallet.dto.ts';
import { WalletTransactionEntity } from './wallet-transaction.entity.ts';

@Entity({ name: 'wallets' })
@Check('"balance" >= 0')
@UseDto(WalletDto)
export class WalletEntity extends AbstractEntity<WalletDto> {
  @Column({ type: 'uuid', unique: true })
  userId!: Uuid;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 4,
    default: 0,
  })
  balance!: number;

  @VersionColumn()
  version!: number;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<UserEntity>;

  @OneToMany(() => WalletTransactionEntity, (transaction) => transaction.wallet)
  transactions?: WalletTransactionEntity[];
}
