import type { Relation } from 'typeorm';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { TransactionType } from '../../constants/transaction-type.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { OrderEntity } from '../order/order.entity.ts';
import { WalletTransactionDto } from './dtos/wallet-transaction.dto.ts';
import { WalletEntity } from './wallet.entity.ts';

@Entity({ name: 'wallet_transactions' })
@Index('IDX_wallet_txn_order', ['orderId'], {
  unique: true,
  where: '"order_id" IS NOT NULL',
})
@Index('IDX_wallet_txn_idempotency', ['idempotencyKey'], {
  unique: true,
  where: '"idempotency_key" IS NOT NULL',
})
@UseDto(WalletTransactionDto)
export class WalletTransactionEntity extends AbstractEntity<WalletTransactionDto> {
  @Column({ type: 'uuid' })
  walletId!: Uuid;

  @Column({ type: 'uuid', nullable: true })
  orderId!: Uuid | null;

  @Column({ type: 'enum', enum: TransactionType })
  type!: TransactionType;

  @Column({ type: 'decimal', precision: 16, scale: 4 })
  amount!: number;

  @Column({ type: 'decimal', precision: 16, scale: 4 })
  balanceBefore!: number;

  @Column({ type: 'decimal', precision: 16, scale: 4 })
  balanceAfter!: number;

  @Column({ type: 'varchar' })
  description!: string;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey!: string | null;

  @ManyToOne(() => WalletEntity, (wallet) => wallet.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Relation<WalletEntity>;

  @ManyToOne(() => OrderEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<OrderEntity> | null;
}
