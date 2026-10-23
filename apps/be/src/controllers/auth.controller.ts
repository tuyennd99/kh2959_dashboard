import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { ResponseMessage } from '../decorators/response-message.decorator';
import { LoginDto } from '../dtos/land.dto';
import { AuthService } from '../services/auth.service';
import type { AccessTokenPayload } from '../types/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Đăng nhập thành công')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth('bearer')
  @Get('me')
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getProfile(user.sub);
  }
}
