import { jest } from '@jest/globals';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { WalletEntity } from './wallet.entity.ts';
import { WalletTransactionEntity } from './wallet-transaction.entity.ts';
import { WalletService } from './wallet.service.ts';
import { LogService } from '../log/log.service.ts';

describe('WalletService', () => {
  let service: WalletService;
  let mockWalletRepo: Record<string, jest.Mock>;
  let mockTxnRepo: Record<string, jest.Mock>;
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    mockWalletRepo = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      }),
    };

    mockTxnRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb({
        findOne: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn(),
        }),
        create: jest.fn(),
        save: jest.fn(),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(WalletEntity), useValue: mockWalletRepo },
        { provide: getRepositoryToken(WalletTransactionEntity), useValue: mockTxnRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LogService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWallet', () => {
    it('should return existing wallet if one exists', async () => {
      const existingWallet = { id: 'wallet-uuid', userId: 'user-uuid', toDto: jest.fn().mockReturnValue({ id: 'wallet-uuid' }) };
      mockWalletRepo.findOneBy.mockResolvedValue(existingWallet);

      const result = await service.createWallet('user-uuid');
      expect(mockWalletRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('hasSufficientBalance', () => {
    it('should return true when balance >= amount', async () => {
      mockWalletRepo.findOneBy.mockResolvedValue({ id: 'wallet-id', balance: 100, toDto: jest.fn() });
      const result = await service.hasSufficientBalance('user-uuid', 50);
      expect(result).toBe(true);
    });
  });
});
