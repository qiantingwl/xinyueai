import { Module } from '@nestjs/common'
import { AssetsController } from './assets.controller'
import { AssetsService } from './assets.service'
import { ObjectStorageService } from './object-storage.service'
import { OfficeTextService } from './office-text.service'

@Module({ controllers: [AssetsController], providers: [AssetsService, ObjectStorageService, OfficeTextService], exports: [AssetsService, ObjectStorageService, OfficeTextService] })
export class AssetsModule {}
