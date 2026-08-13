import { Injectable } from '@nestjs/common';
import { MarketingAssetType, MarketingLanguage } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  createAsset(user: AuthUser, dto: any) {
    return this.prisma.marketingAsset.create({
      data: {
        title: dto.title,
        type: dto.type,
        language: dto.language,
        fileUrl: dto.fileUrl,
        caption: dto.caption,
        description: dto.description,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      },
    });
  }

  assets(query: { type?: MarketingAssetType; language?: MarketingLanguage }) {
    return this.prisma.marketingAsset.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.language ? { language: query.language } : {}),
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  asset(id: string) {
    return this.prisma.marketingAsset.findUnique({ where: { id } });
  }

  createCampaign(user: AuthUser, dto: any) {
    return this.prisma.campaign.create({
      data: {
        title: dto.title,
        description: dto.description,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive ?? true,
        createdById: user.id,
      },
    });
  }

  campaigns() {
    return this.prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
