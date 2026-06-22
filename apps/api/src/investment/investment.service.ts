import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InvestmentService {
  constructor(private readonly prisma: PrismaService) {}

  createInvestor(dto: any) {
    return this.prisma.investor.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        budgetAmount: Number(dto.budgetAmount ?? 0),
        interestType: dto.interestType,
        status: dto.status,
        notes: dto.notes,
      },
    });
  }
  investors() { return this.prisma.investor.findMany({ orderBy: { createdAt: 'desc' } }); }
  createCandidate(dto: any) {
    return this.prisma.franchiseCandidate.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        investmentBudget: Number(dto.investmentBudget ?? 0),
        experience: dto.experience,
        status: dto.status,
        score: Number(dto.score ?? 0),
      },
    });
  }
  candidates() { return this.prisma.franchiseCandidate.findMany({ orderBy: { createdAt: 'desc' } }); }
  createDeal(dto: any) {
    return this.prisma.investmentDeal.create({
      data: {
        investorId: dto.investorId,
        candidateId: dto.candidateId,
        status: dto.status,
        amount: Number(dto.amount ?? 0),
        notes: dto.notes,
      },
      include: { investor: true, candidate: true },
    });
  }
  deals() { return this.prisma.investmentDeal.findMany({ include: { investor: true, candidate: true }, orderBy: { createdAt: 'desc' } }); }
  createMatchmaking(dto: any) {
    return this.prisma.matchmakingRecord.create({
      data: {
        investorId: dto.investorId,
        candidateId: dto.candidateId,
        score: Number(dto.score ?? 0),
        notes: dto.notes,
      },
      include: { investor: true, candidate: true },
    });
  }
  matchmaking() { return this.prisma.matchmakingRecord.findMany({ include: { investor: true, candidate: true }, orderBy: { createdAt: 'desc' } }); }
}
