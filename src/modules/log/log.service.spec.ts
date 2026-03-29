import { jest } from '@jest/globals';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { LogLevel } from '../../constants/log-level.ts';
import { LogEntity } from './log.entity.ts';
import { LogService } from './log.service.ts';

describe('LogService', () => {
  let service: LogService;
  let mockRepository: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogService,
        { provide: getRepositoryToken(LogEntity), useValue: mockRepository },
      ],
    }).compile();

    service = module.get<LogService>(LogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should persist log entry to database', async () => {
      await service.log(LogLevel.INFO, 'TestContext', 'TEST_ACTION', 'Test message');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          context: 'TestContext',
          action: 'TEST_ACTION',
          message: 'Test message',
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('info', () => {
    it('should call log with INFO level', async () => {
      await service.info('Context', 'ACTION', 'Message');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ level: LogLevel.INFO }),
      );
    });
  });

  describe('error', () => {
    it('should never throw even if database save fails', async () => {
      mockRepository.save.mockRejectedValue(new Error('DB Error'));
      // Should not throw
      await expect(service.error('Context', 'ACTION', 'Message')).resolves.toBeUndefined();
    });
  });
});
