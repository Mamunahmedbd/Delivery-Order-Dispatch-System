import { jest } from '@jest/globals';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { OrderNotFoundException } from '../../exceptions/order-not-found.exception.ts';
import { AssignmentNotFoundException } from '../../exceptions/assignment-not-found.exception.ts';
import { OrderEntity } from './order.entity.ts';
import { OrderAssignmentEntity } from './order-assignment.entity.ts';
import { OrderService } from './order.service.ts';
import { WalletService } from '../wallet/wallet.service.ts';
import { LogService } from '../log/log.service.ts';

describe('OrderService', () => {
  let service: OrderService;
  let mockOrderRepo: Record<string, jest.Mock>;
  let mockAssignmentRepo: Record<string, jest.Mock>;
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    mockOrderRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockAssignmentRepo = {
      find: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb({
        findOne: jest.fn(),
        findOneBy: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn(),
        }),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(OrderEntity), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderAssignmentEntity), useValue: mockAssignmentRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: WalletService, useValue: { hasSufficientBalance: jest.fn().mockResolvedValue(true) } },
        { provide: LogService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrder', () => {
    it('should throw OrderNotFoundException when order not found', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      await expect(service.getOrder('nonexistent')).rejects.toThrow(OrderNotFoundException);
    });
  });

  describe('getFailedDriverIds', () => {
    it('should return driver IDs from rejected/expired assignments', async () => {
      mockAssignmentRepo.find.mockResolvedValue([
        { driverId: 'driver-1' },
        { driverId: 'driver-2' },
      ]);
      const result = await service.getFailedDriverIds('order-1');
      expect(result).toEqual(['driver-1', 'driver-2']);
    });
  });
});
