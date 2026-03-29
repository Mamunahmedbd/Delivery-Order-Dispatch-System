import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import {
  NumberField,
  UUIDField,
} from '../../../decorators/field.decorators.ts';
import type { WalletEntity } from '../wallet.entity.ts';

export class WalletDto extends AbstractDto {
  @UUIDField()
  userId!: Uuid;

  @NumberField()
  balance!: number;

  @NumberField()
  version!: number;

  constructor(wallet: WalletEntity) {
    super(wallet);
    this.userId = wallet.userId;
    this.balance = wallet.balance;
    this.version = wallet.version;
  }
}
