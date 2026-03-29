import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { DriverStatus } from '../../constants/driver-status.ts';
import { RoleType } from '../../constants/role-type.ts';
import { DriverNotFoundException } from '../../exceptions/driver-not-found.exception.ts';
import { LogService } from '../log/log.service.ts';
import { UserEntity } from '../user/user.entity.ts';
import { WalletService } from '../wallet/wallet.service.ts';
import { DriverEntity } from './driver.entity.ts';
import type { DriverDto } from './dtos/driver.dto.ts';

@Injectable()
export class DriverService {
  constructor(
    @InjectRepository(DriverEntity)
    private readonly driverRepository: Repository<DriverEntity>,
    private readonly dataSource: DataSource,
    private readonly logService: LogService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Register the authenticated user as a driver.
   * Updates user role to DRIVER and creates a driver profile + wallet.
   */
  async register(userId: Uuid): Promise<DriverDto> {
    // Check already registered
    const existing = await this.driverRepository.findOneBy({ userId });

    if (existing) {
      throw new BadRequestException('User is already registered as a driver');
    }

    return this.dataSource.transaction(async (manager) => {
      // Update user role
      await manager.update(UserEntity, userId, { role: RoleType.DRIVER });

      // Create driver profile
      const driver = manager.create(DriverEntity, {
        userId,
        status: DriverStatus.OFFLINE,
        isVerified: false,
        latitude: null,
        longitude: null,
        lastLocationUpdate: null,
      });

      const savedDriver = await manager.save(DriverEntity, driver);

      // Ensure driver has a wallet
      await this.walletService.createWallet(userId);

      await this.logService.info(
        'DriverService',
        'REGISTER',
        'Driver registered',
        {
          userId,
          driverId: savedDriver.id,
        },
      );

      return savedDriver.toDto();
    });
  }

  /**
   * Find the nearest available driver to a pickup location.
   * Uses Euclidean distance approximation (sufficient for city-scale).
   * Excludes drivers by ID (previously failed assignments).
   */
  async findNearestAvailable(
    lat: number,
    lng: number,
    excludeIds: Uuid[] = [],
  ): Promise<DriverEntity | null> {
    const qb = this.driverRepository
      .createQueryBuilder('driver')
      .where('driver.status = :status', { status: DriverStatus.AVAILABLE })
      .andWhere('driver.isVerified = true')
      .andWhere('driver.latitude IS NOT NULL')
      .andWhere('driver.longitude IS NOT NULL');

    if (excludeIds.length > 0) {
      qb.andWhere('driver.id NOT IN (:...excludeIds)', { excludeIds });
    }

    qb.orderBy(
      `SQRT(POWER(driver.latitude - :lat, 2) + POWER(driver.longitude - :lng, 2))`,
      'ASC',
    )
      .setParameters({ lat, lng })
      .limit(1);

    return qb.getOne();
  }

  /**
   * Mark a driver as BUSY with row-level lock to prevent double-assignment.
   * Returns the locked driver entity.
   */
  async markBusy(driverId: Uuid): Promise<DriverDto> {
    return this.dataSource.transaction(async (manager) => {
      const driver = await manager
        .createQueryBuilder(DriverEntity, 'driver')
        .setLock('pessimistic_write')
        .where('driver.id = :driverId', { driverId })
        .getOne();

      if (!driver) {
        throw new DriverNotFoundException();
      }

      if (driver.status !== DriverStatus.AVAILABLE) {
        throw new BadRequestException(
          `Driver is not available (current status: ${driver.status})`,
        );
      }

      driver.status = DriverStatus.BUSY;
      await manager.save(DriverEntity, driver);

      return driver.toDto();
    });
  }

  /**
   * Mark a driver as AVAILABLE.
   */
  async markAvailable(driverId: Uuid): Promise<DriverDto> {
    const driver = await this.driverRepository.findOneBy({ id: driverId });

    if (!driver) {
      throw new DriverNotFoundException();
    }

    driver.status = DriverStatus.AVAILABLE;
    const savedDriver = await this.driverRepository.save(driver);

    return savedDriver.toDto();
  }

  /**
   * Update the driver's GPS location.
   */
  async updateLocation(
    driverId: Uuid,
    lat: number,
    lng: number,
  ): Promise<DriverDto> {
    const driver = await this.driverRepository.findOneBy({ id: driverId });

    if (!driver) {
      throw new DriverNotFoundException();
    }

    driver.latitude = lat;
    driver.longitude = lng;
    driver.lastLocationUpdate = new Date();

    return (await this.driverRepository.save(driver)).toDto();
  }

  /**
   * Update the driver's availability status.
   */
  async updateStatus(
    driverId: Uuid,
    status: DriverStatus,
  ): Promise<DriverDto> {
    const driver = await this.driverRepository.findOneBy({ id: driverId });

    if (!driver) {
      throw new DriverNotFoundException();
    }

    driver.status = status;

    return (await this.driverRepository.save(driver)).toDto();
  }

  /**
   * Find a driver by their user ID.
   */
  async findByUserId(userId: Uuid): Promise<DriverEntity | null> {
    return this.driverRepository.findOneBy({ userId });
  }
}
