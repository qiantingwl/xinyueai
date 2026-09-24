import { Injectable, OnModuleInit } from '@nestjs/common'
import { ensureDefaultSkillPresets } from '../plugins/default-skill-presets'
import { PrismaService } from '../prisma/prisma.service'
import { ensureDefaultCapabilityPresets } from './default-capability-presets'

@Injectable()
export class CapabilityPresetsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await ensureDefaultCapabilityPresets(this.prisma)
    await ensureDefaultSkillPresets(this.prisma)
  }
}
