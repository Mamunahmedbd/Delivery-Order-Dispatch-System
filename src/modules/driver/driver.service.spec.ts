import { jest } from '@jest/globals';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { DriverNotFoundException } from '../../exceptions/driver-not-found.exception.ts';
import { DriverEntity } from './driver.entity.ts';
import { DriverService } from './driver.service.ts';
import { WalletService } from '../wallet/wallet.service.ts';
import { LogService } from '../log/log.service.ts';

describe('DriverService', () => {
  let service: DriverService;
  let mockRepository: Record<string, jest.Mock>;
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    mockRepository = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        setLock: jest.fn().mockReturnThis(),
        getOne: jest.fn(),
      }),
    };

    mockDataSource = {
      transaction: jest.fn((cb) => cb({
        update: jest.fn(),
        create: jest.fn().mockReturnValue({ id: 'driver-uuid' }),
        save: jest.fn().mockResolvedValue({ id: 'driver-uuid', toDto: jest.fn().mockReturnValue({ id: 'driver-uuid' }) }),
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn(),
        }),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverService,
        {
          provide: getRepositoryToken(DriverEntity),
          useValue: mockRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
        { provide: WalletService, useValue: { createWallet: jest.fn() } },
        { provide: LogService, useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<DriverService>(DriverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByUserId', () => {
    it('should return a driver when found', async () => {
      const mockDriver = { id: 'driver-uuid', userId: 'user-uuid' };
      mockRepository.findOneBy.mockResolvedValue(mockDriver);

      const result = await service.findByUserId('user-uuid');
      expect(result).toEqual(mockDriver);
    });

    it('should return null when not found', async () => {
      mockRepository.findOneBy.mockResolvedValue(null);
      const result = await service.findByUserId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('register', () => {
    it('should throw BadRequestException if already registered', async () => {
      mockRepository.findOneBy.mockResolvedValue({ id: 'existing' });

      await expect(service.register('user-uuid')).rejects.toThrow('User is already registered as a driver');
    });
  });

  describe('markBusy', () => {
    it('should throw DriverNotFoundException if driver not found', async () => {
      mockDataSource.transaction.mockImplementation(async (cb) => {
        const manager = {
          createQueryBuilder: jest.fn().mockReturnValue({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(null),
          }),
          save: jest.fn(),
        };
        return cb(manager);
      });

      await expect(service.markBusy('nonexistent')).rejects.toThrow(DriverNotFoundException);
    });
  });
});
