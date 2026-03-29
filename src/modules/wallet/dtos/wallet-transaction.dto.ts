import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { TransactionType } from '../../../constants/transaction-type.ts';
import {
  EnumField,
  NumberField,
  StringField,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators.ts';
import type { WalletTransactionEntity } from '../wallet-transaction.entity.ts';

export class WalletTransactionDto extends AbstractDto {
  @UUIDField()
  walletId!: Uuid;

  @UUIDFieldOptional({ nullable: true })
  orderId?: Uuid | null;

  @EnumField(() => TransactionType)
  type!: TransactionType;

  @NumberField()
  amount!: number;

  @NumberField()
  balanceBefore!: number;

  @NumberField()
  balanceAfter!: number;

  @StringField()
  description!: string;

  @StringField({ nullable: true })
  idempotencyKey?: string | null;

  constructor(transaction: WalletTransactionEntity) {
    super(transaction);
    this.walletId = transaction.walletId;
    this.orderId = transaction.orderId;
    this.type = transaction.type;
    this.amount = transaction.amount;
    this.balanceBefore = transaction.balanceBefore;
    this.balanceAfter = transaction.balanceAfter;
    this.description = transaction.description;
    this.idempotencyKey = transaction.idempotencyKey;
  }
}
