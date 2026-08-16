import { Module } from '@nestjs/common'
import { AdminProvidersController } from './admin-providers.controller'
import { CatalogController } from './catalog.controller'
import { CredentialCryptoService } from './credential-crypto.service'
import { ProvidersService } from './providers.service'
import { UserCredentialsController, UserModelPolicyController } from './user-credentials.controller'
import { RechargeController } from './recharge.controller'
import { AssetsModule } from '../assets/assets.module'

@Module({
  imports: [AssetsModule],
  controllers: [CatalogController, UserCredentialsController, UserModelPolicyController, AdminProvidersController, RechargeController],
  providers: [CredentialCryptoService, ProvidersService],
  exports: [CredentialCryptoService, ProvidersService],
})
export class ProvidersModule {}
