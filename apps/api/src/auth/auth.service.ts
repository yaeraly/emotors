import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { branch: true },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };
    const tokens = await this.issueTokens(authUser);

    return {
      ...tokens,
      user: {
        ...authUser,
        fullName: user.fullName,
        branch: user.branch,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user?.refreshTokenHash || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!matches) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.issueTokens({
        id: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branchId,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  private async issueTokens(user: AuthUser) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };
    const accessExpiresIn = (this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      '15m') as JwtSignOptions['expiresIn'];
    const refreshExpiresIn = (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as JwtSignOptions['expiresIn'];

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
        expiresIn: accessExpiresIn,
      }),
      this.jwt.signAsync(payload, {
        secret:
          this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
        expiresIn: refreshExpiresIn,
      }),
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) },
    });

    return { accessToken, refreshToken };
  }
}
