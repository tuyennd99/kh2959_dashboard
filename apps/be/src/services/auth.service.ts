import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { env } from '../config/env';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../constants/auth';
import { LoginDto } from '../dtos/land.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUserDto, LoginResponseDto } from '@land/shared';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    const email = (
      process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@datdai.local'
    )
      .trim()
      .toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'Admin@123456';

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName: 'Quản trị viên Đất đai',
          role: 'ADMIN',
          isActive: true,
        },
      });
    }
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new HttpException(
        { message: 'Email hoặc mật khẩu không đúng' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new HttpException(
        { message: 'Email hoặc mật khẩu không đúng' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
      },
      {
        secret: env(process.env).jwtSecret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async getProfile(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new HttpException(
        { message: 'Tài khoản không tồn tại' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
