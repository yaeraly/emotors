import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { BranchDto, CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        branch: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createUser(dto: CreateUserDto) {
    await this.ensureBranch(dto.branchId);
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        role: dto.role,
        branchId: dto.branchId,
        passwordHash: await bcrypt.hash(dto.password, 12),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
        branch: true,
      },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    if (dto.branchId) {
      await this.ensureBranch(dto.branchId);
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        role: dto.role,
        branchId: dto.branchId,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 12) : undefined,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        branchId: true,
        isActive: true,
        branch: true,
      },
    });
  }

  createBranch(dto: BranchDto) {
    return this.prisma.branch.create({
      data: { name: dto.name, code: dto.code },
    });
  }

  listBranches() {
    return this.prisma.branch.findMany({ orderBy: { name: 'asc' } });
  }

  private async ensureBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }
}
