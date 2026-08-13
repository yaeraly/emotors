import { Injectable } from '@nestjs/common';
import { FranchiseApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpansionService {
  constructor(private readonly prisma: PrismaService) {}
  createCity(dto: any) {
    return this.prisma.cityAnalysis.create({
      data: {
        city: dto.city,
        population: Number(dto.population ?? 0),
        estimatedDemand: Number(dto.estimatedDemand ?? 0),
        competitors: Number(dto.competitors ?? 0),
        serviceDemandScore: Number(dto.serviceDemandScore ?? 0),
        partsDemandScore: Number(dto.partsDemandScore ?? 0),
        priorityScore: Number(dto.priorityScore ?? 0),
      },
    });
  }
  cities() { return this.prisma.cityAnalysis.findMany({ orderBy: { priorityScore: 'desc' } }); }
  createLocation(dto: any) {
    return this.prisma.locationCandidate.create({
      data: {
        city: dto.city,
        address: dto.address,
        rentCost: Number(dto.rentCost ?? 0),
        trafficScore: Number(dto.trafficScore ?? 0),
        visibilityScore: Number(dto.visibilityScore ?? 0),
        warehouseSuitability: Number(dto.warehouseSuitability ?? 0),
        notes: dto.notes,
      },
    });
  }
  locations() { return this.prisma.locationCandidate.findMany({ orderBy: { createdAt: 'desc' } }); }
  createApplication(dto: any) {
    return this.prisma.franchiseApplication.create({
      data: { fullName: dto.fullName, phone: dto.phone, city: dto.city, status: dto.status, notes: dto.notes },
    });
  }
  applications() { return this.prisma.franchiseApplication.findMany({ include: { approvals: true }, orderBy: { createdAt: 'desc' } }); }
  async approveApplication(id: string, dto: any) {
    await this.prisma.franchiseApproval.create({ data: { applicationId: id, note: dto.note } });
    return this.prisma.franchiseApplication.update({
      where: { id },
      data: { status: FranchiseApplicationStatus.APPROVED },
      include: { approvals: true },
    });
  }
}
